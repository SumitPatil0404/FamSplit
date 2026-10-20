import type { Session, SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import Storage from 'expo-sqlite/kv-store';
import * as WebBrowser from 'expo-web-browser';
import { useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { registerForPush, startPushListeners, unregisterFromPush } from '@/notifications/push';
import { applyRemoteTrips, getTrips, setLocalChangeListener, type StoredTrip } from '@/store/trips';

import {
  diffRows,
  hasChanges,
  rowsToActivity,
  rowsToTrip,
  tripToRows,
  type ActivityRow,
  type ExpenseRow,
  type FamilyRow,
  type MemberRow,
  type PaymentRow,
  type TripRow,
} from './rows';
import { supabase } from './supabase';

export type SyncState = {
  /** False when there are no Supabase keys and the app works on this phone only. */
  configured: boolean;
  session: Session | null;
  status: 'idle' | 'syncing' | 'error';
  error: string | null;
};

type Removal = { tripId: string; mode: 'delete' | 'leave' };

const BASES_KEY = 'famsplit.sync.bases.v1';
const REMOVALS_KEY = 'famsplit.sync.removals.v1';
const RETRY_MS = 20000;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Each trip as the server last had it, so only the rows changed since then are sent. */
let bases = read<Record<string, StoredTrip>>(BASES_KEY, {});
/** Trips deleted on this phone that still have to be deleted, or left, on the server. */
let removals = read<Removal[]>(REMOVALS_KEY, []);

function persist() {
  Storage.setItemSync(BASES_KEY, JSON.stringify(bases));
  Storage.setItemSync(REMOVALS_KEY, JSON.stringify(removals));
}

let state: SyncState = { configured: supabase !== null, session: null, status: 'idle', error: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;

export function useSync(): SyncState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** The server's sign-in errors, reworded for someone who is not a developer. */
const FRIENDLY: [RegExp, string][] = [
  [/provider is not enabled|unsupported provider/i, 'Google sign-in is not switched on for this app yet.'],
  [/redirect/i, 'Google sign-in is not fully set up for this app yet.'],
  [/access[_ ]denied/i, 'Google sign-in was cancelled.'],
  [/rate limit|too many/i, 'Too many attempts. Wait a few minutes and try again.'],
];

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  if (/network|fetch|timed? ?out/i.test(message)) {
    return 'Can’t reach the server. Changes are saved on this phone and will sync later.';
  }
  return FRIENDLY.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

async function fetchAll<Row>(client: SupabaseClient, table: string, orderBy: string[]): Promise<Row[]> {
  const pageSize = 1000;
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = client.from(table).select('*');
    for (const column of orderBy) {
      query = query.order(column);
    }
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      throw error;
    }
    rows.push(...(data as Row[]));
    if (data.length < pageSize) {
      return rows;
    }
  }
}

/** Why the last upload left something behind, in words the account screen can show. */
let pushProblem = '';

/** Sends local edits to the server. Returns the trips that could not be sent. */
async function push(client: SupabaseClient, userId: string): Promise<Set<string>> {
  for (const removal of removals) {
    const { error } =
      removal.mode === 'delete'
        ? await client.from('trips').delete().eq('id', removal.tripId)
        : await client.from('trip_users').delete().eq('trip_id', removal.tripId).eq('user_id', userId);
    if (error) {
      throw error;
    }
    removals = removals.filter((other) => other !== removal);
    bases = Object.fromEntries(Object.entries(bases).filter(([tripId]) => tripId !== removal.tripId));
    persist();
  }

  const failed = new Set<string>();
  for (const trip of getTrips()) {
    const base = bases[trip.id];
    const rows = tripToRows(trip);
    const changes = diffRows(base && tripToRows(base), rows);
    if (!hasChanges(changes)) {
      continue;
    }

    // First the trip itself and who this user is on it, so the server's activity log can name them.
    const first: PromiseLike<{ error: { message: string } | null }>[] = [];
    if (changes.isNew) {
      // "Ignore duplicates" makes a half-finished earlier upload safe to repeat.
      const { finalized_at: _finalizedAt, ...created } = rows.trip;
      first.push(client.from('trips').upsert(created, { onConflict: 'id', ignoreDuplicates: true }));
    } else if (changes.renamed) {
      first.push(client.from('trips').update({ name: rows.trip.name }).eq('id', trip.id));
    }
    let sent = await Promise.all(first);
    if (sent.some((result) => result.error && /network|fetch/i.test(result.error.message))) {
      throw sent.find((result) => result.error)!.error;
    }
    if (changes.isNew && !sent.some((result) => result.error)) {
      // The trip now exists on the server even if the rest of the upload fails, so remember an empty
      // version of it: the next sync then sends what is missing, and deleting it here deletes it there.
      const { finalizedAt: _finalizedAt, ...shell } = trip;
      bases = { ...bases, [trip.id]: { ...shell, meId: '', families: [], members: [], expenses: [], payments: [] } };
      persist();
    }
    if (!sent.some((result) => result.error) && changes.meChanged) {
      sent = [await client.from('trip_users').update({ member_id: rows.meId }).eq('trip_id', trip.id).eq('user_id', userId)];
    }

    if (!sent.some((result) => result.error)) {
      const steps: PromiseLike<{ error: { message: string } | null }>[] = [];
      // Databases set up before UPI ids existed have no such column, so only mention it when it is in use.
      const usesUpi = [...rows.members, ...(base ? tripToRows(base).members : [])].some((member) => member.upi_id);
      // The same for expense categories, which came with update-4.sql.
      const usesCategory = [...rows.expenses, ...(base ? tripToRows(base).expenses : [])].some((expense) => expense.category);
      for (const table of ['families', 'members', 'expenses', 'payments'] as const) {
        const upserts: object[] =
          table === 'members' && !usesUpi
            ? changes.members.upserts.map(({ upi_id: _upiId, ...member }) => member)
            : table === 'expenses' && !usesCategory
              ? changes.expenses.upserts.map(({ category: _category, ...expense }) => expense)
              : changes[table].upserts;
        const deletes = changes[table].deletes;
        if (upserts.length > 0) {
          steps.push(client.from(table).upsert(upserts, { onConflict: 'trip_id,id' }));
        }
        if (deletes.length > 0) {
          steps.push(client.from(table).delete().eq('trip_id', trip.id).in('id', deletes));
        }
      }
      if (changes.finalizedChanged) {
        steps.push(client.from('trips').update({ finalized_at: rows.trip.finalized_at }).eq('id', trip.id));
      }
      sent = await Promise.all(steps);
    }

    const problem = sent.find((result) => result.error)?.error;
    if (problem) {
      pushProblem = /column|schema cache/i.test(problem.message)
        ? 'The database is missing its latest update. Run the newest supabase/update-*.sql file in the Supabase SQL editor.'
        : 'Some changes could not be saved to the server yet.';
      failed.add(trip.id);
      continue;
    }
    bases = { ...bases, [trip.id]: trip };
    persist();
  }
  return failed;
}

/** Replaces local trips with the server's. Returns false if the phone was edited meanwhile, so the caller goes round again. */
async function pull(client: SupabaseClient, userId: string, failed: Set<string>): Promise<boolean> {
  const before = getTrips();

  const links = await client.from('trip_users').select('trip_id, member_id').eq('user_id', userId);
  if (links.error) {
    throw links.error;
  }
  const meByTrip = new Map(links.data.map((link) => [link.trip_id as string, link.member_id as string | null]));

  const [tripRows, families, members, expenses, payments] = await Promise.all([
    fetchAll<TripRow & { created_by: string | null }>(client, 'trips', ['id']),
    fetchAll<FamilyRow>(client, 'families', ['trip_id', 'id']),
    fetchAll<MemberRow>(client, 'members', ['trip_id', 'id']),
    fetchAll<ExpenseRow>(client, 'expenses', ['trip_id', 'id']),
    fetchAll<PaymentRow>(client, 'payments', ['trip_id', 'id']),
  ]);
  // The newest few hundred log lines are plenty to show; a database without the log simply has none.
  const log = await client.from('activity').select('*').order('id', { ascending: false }).limit(400);
  const logRows = (log.data ?? []) as ActivityRow[];

  // Anything edited while the download was in flight has to be sent first, or it would be overwritten.
  const edited = before.some(
    (trip) => !failed.has(trip.id) && hasChanges(diffRows(bases[trip.id] && tripToRows(bases[trip.id]), tripToRows(trip))),
  );
  if (getTrips() !== before || edited) {
    return false;
  }

  const remote = tripRows
    .filter((row) => meByTrip.has(row.id))
    .map((row) => ({
      ...rowsToTrip(
        {
          trip: { ...row, finalized_at: row.finalized_at ?? null },
          meId: meByTrip.get(row.id) ?? null,
          families: families.filter((family) => family.trip_id === row.id),
          members: members.filter((member) => member.trip_id === row.id),
          expenses: expenses.filter((expense) => expense.trip_id === row.id),
          payments: payments.filter((payment) => payment.trip_id === row.id),
        },
        row.created_by,
      ),
      activity: rowsToActivity(logRows.filter((entry) => entry.trip_id === row.id)),
    }));
  const remoteIds = new Set(remote.map((trip) => trip.id));

  // A trip whose edits could not be sent keeps its local version, so nothing typed is lost.
  // The exception is one the server no longer has for this user: it was deleted or left elsewhere.
  const unsent = before.filter((trip) => failed.has(trip.id) && (remoteIds.has(trip.id) || !bases[trip.id]));
  const unsentIds = new Set(unsent.map((trip) => trip.id));

  const next = [...unsent, ...remote.filter((trip) => !unsentIds.has(trip.id))].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  bases = Object.fromEntries([
    ...remote.filter((trip) => !unsentIds.has(trip.id)).map((trip) => [trip.id, trip] as const),
    ...unsent.filter((trip) => bases[trip.id]).map((trip) => [trip.id, bases[trip.id]] as const),
  ]);
  persist();
  applyRemoteTrips(next);
  return true;
}

// Hot reloading in development loads this file again while the old copy's timers are still alive.
// The old copy must stop, or two would sync at once and overwrite each other's work.
let retired = false;
(module as unknown as { hot?: { dispose(callback: () => void): void } }).hot?.dispose(() => {
  retired = true;
  clearTimeout(debounce);
  clearTimeout(retry);
});

let running: Promise<void> | null = null;
let again = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;

async function run(client: SupabaseClient, userId: string) {
  setState({ status: 'syncing', error: null });
  clearTimeout(retry);
  try {
    let failed: Set<string>;
    let settled: boolean;
    do {
      again = false;
      failed = await push(client, userId);
      settled = await pull(client, userId, failed);
    } while (again || !settled);

    if (failed.size > 0) {
      setState({ status: 'error', error: pushProblem });
      retry = setTimeout(() => void syncNow(), RETRY_MS);
    } else {
      setState({ status: 'idle', error: null });
    }
  } catch (error) {
    setState({ status: 'error', error: describe(error) });
    retry = setTimeout(() => void syncNow(), RETRY_MS);
  }
}

/** Pushes local edits and pulls everyone else's. Safe to call at any time; overlapping calls share one run. */
export function syncNow(): Promise<void> {
  const userId = state.session?.user.id;
  if (!supabase || !userId || retired) {
    return Promise.resolve();
  }
  if (running) {
    again = true;
    return running;
  }
  running = run(supabase, userId).finally(() => {
    running = null;
  });
  return running;
}

export function requestSync(delayMs = 600) {
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delayMs);
}

function setSession(session: Session | null) {
  const previousUser = state.session?.user.id;
  setState({ session });
  if (!supabase || session?.user.id === previousUser) {
    return;
  }

  // Clear out every old subscription, including ones left behind when this file is hot-reloaded in development.
  for (const stale of supabase.getChannels()) {
    void supabase.removeChannel(stale);
  }
  if (session) {
    try {
      // Row-level security means this only hears about trips the user is on. The name is unique
      // because a channel that is still closing cannot be given new listeners.
      supabase
        .channel(`famsplit-changes-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public' }, () => requestSync(1000))
        .subscribe();
    } catch {
      // Live updates are a bonus; syncing on demand and on app open still works without them.
    }
    void registerForPush(supabase);
    requestSync(0);
  }
}

let started = false;

/** Call once when the app starts. Does nothing if Supabase is not configured. */
export function startSync() {
  if (!supabase || started) {
    return;
  }
  started = true;
  const client = supabase;

  setLocalChangeListener(({ removedTrip }) => {
    if (removedTrip && bases[removedTrip.id]) {
      // A trip with no recorded creator was made on this phone and has not been downloaded back yet.
      const mine = removedTrip.createdBy === undefined || removedTrip.createdBy === state.session?.user.id;
      removals = [...removals, { tripId: removedTrip.id, mode: mine ? 'delete' : 'leave' }];
      persist();
    }
    requestSync();
  });

  // A notification means something changed, so fetch it straight away.
  startPushListeners(() => requestSync(0));

  void client.auth.getSession().then(({ data }) => setSession(data.session));
  client.auth.onAuthStateChange((_event, session) => setSession(session));
  void client.auth.startAutoRefresh();

  AppState.addEventListener('change', (appState) => {
    if (appState === 'active') {
      void client.auth.startAutoRefresh();
      requestSync(0);
    } else {
      void client.auth.stopAutoRefresh();
    }
  });
}

/** True when this trip is on the server, so other families can join it. */
export function isShared(tripId: string): boolean {
  return bases[tripId] !== undefined;
}

export function hasUnsentChanges(): boolean {
  return (
    removals.length > 0 ||
    getTrips().some((trip) => hasChanges(diffRows(bases[trip.id] && tripToRows(bases[trip.id]), tripToRows(trip))))
  );
}

/**
 * Signs in with a Google account in a browser tab, then comes back to the app.
 * Returns an error message, or null when it worked or the person simply closed the tab.
 */
export async function signInWithGoogle(): Promise<string | null> {
  if (!supabase) {
    return 'Sharing is not set up in this build.';
  }
  // Ask first whether Google sign-in is switched on, so a half-configured project gives a clear
  // message here instead of a page of error text in the browser.
  try {
    const settings = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
    });
    if (settings.ok && (await settings.json()).external?.google === false) {
      return 'Google sign-in is not switched on for this app yet.';
    }
  } catch {
    return describe('Network request failed');
  }

  // Where Google sends the person back to: this app, at the "auth-callback" screen.
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) {
    return describe(error ?? 'Google sign-in could not be started.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    return null;
  }

  // The answer comes back in the link itself: after a "#" on success, after a "?" on failure.
  const [beforeFragment, fragment = ''] = result.url.split('#');
  const query = beforeFragment.split('?')[1] ?? '';
  const answer = new URLSearchParams(fragment || query);
  const refused = answer.get('error_description') ?? new URLSearchParams(query).get('error_description');
  if (refused) {
    return describe(refused);
  }
  const accessToken = answer.get('access_token');
  const refreshToken = answer.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return 'Google sign-in did not finish. Please try again.';
  }
  const session = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return session.error ? describe(session.error) : null;
}

export async function signOut() {
  if (!supabase) {
    return;
  }
  await unregisterFromPush(supabase);
  await supabase.auth.signOut();
  // Shared trips live on the server and come back at the next sign-in; trips never uploaded stay on the phone.
  applyRemoteTrips(getTrips().filter((trip) => !bases[trip.id]));
  bases = {};
  removals = [];
  persist();
}

/** Joins the trip behind an invite code and returns its id. Throws with a readable message. */
export async function joinTrip(code: string): Promise<string> {
  if (!supabase || !state.session) {
    throw new Error('Sign in first to join a trip.');
  }
  const { data, error } = await supabase.rpc('join_trip', { code });
  if (error) {
    throw new Error(describe(error));
  }
  await syncNow();
  return data as string;
}

/** For pull-to-refresh: the spinner shows only while a sync the user asked for is running. */
export function usePullToSync(): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  return {
    refreshing,
    onRefresh: () => {
      setRefreshing(true);
      void syncNow().finally(() => setRefreshing(false));
    },
  };
}

/**
 * Sends a "please pay" push notification to whoever owes the money. Returns how many phones it
 * reaches: 0 means they do not use the app, so they have to be reminded some other way.
 * Throws with a readable message, for example when a reminder was sent only minutes ago.
 */
export async function sendReminder(
  tripId: string,
  transfer: { fromMemberId: string; toMemberId: string; amount: number },
): Promise<number> {
  if (!supabase || !state.session) {
    return 0;
  }
  const { data, error } = await supabase.rpc('send_reminder', {
    trip: tripId,
    from_member: transfer.fromMemberId,
    to_member: transfer.toMemberId,
    owed: transfer.amount,
  });
  if (error) {
    throw new Error(describe(error));
  }
  return Number(data) || 0;
}

/**
 * Permanently deletes the signed-in account on the server, then clears it from this phone.
 * Returns an error message, or null when it worked.
 */
export async function deleteAccount(): Promise<string | null> {
  if (!supabase || !state.session) {
    return 'You are not signed in.';
  }
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    return /network|fetch|failed to send/i.test(error.message)
      ? 'Can’t reach the server. Check your connection and try again.'
      : 'The account could not be deleted. Please try again.';
  }
  // The server-side session went with the account, so only this phone is left to clear.
  await supabase.auth.signOut({ scope: 'local' });
  applyRemoteTrips(getTrips().filter((trip) => !bases[trip.id]));
  bases = {};
  removals = [];
  persist();
  return null;
}
