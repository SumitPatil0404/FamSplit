import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { applyRemoteTrips, getTrips, setLocalChangeListener, type StoredTrip } from '@/store/trips';

import {
  diffRows,
  hasChanges,
  rowsToTrip,
  tripToRows,
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

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  return /network|fetch|timed? ?out/i.test(message)
    ? 'Can’t reach the server. Changes are saved on this phone and will sync later.'
    : message;
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

    const steps: PromiseLike<{ error: unknown }>[] = [];
    if (changes.isNew) {
      // "Ignore duplicates" makes a half-finished earlier upload safe to repeat.
      const created = await client.from('trips').upsert(rows.trip, { onConflict: 'id', ignoreDuplicates: true });
      if (created.error) {
        if (/network|fetch/i.test(created.error.message)) {
          throw created.error;
        }
        failed.add(trip.id);
        continue;
      }
    } else if (changes.renamed) {
      steps.push(client.from('trips').update({ name: rows.trip.name }).eq('id', trip.id));
    }
    for (const table of ['families', 'members', 'expenses', 'payments'] as const) {
      const upserts: object[] = changes[table].upserts;
      const deletes = changes[table].deletes;
      if (upserts.length > 0) {
        steps.push(client.from(table).upsert(upserts, { onConflict: 'trip_id,id' }));
      }
      if (deletes.length > 0) {
        steps.push(client.from(table).delete().eq('trip_id', trip.id).in('id', deletes));
      }
    }
    if (changes.meChanged) {
      steps.push(client.from('trip_users').update({ member_id: rows.meId }).eq('trip_id', trip.id).eq('user_id', userId));
    }

    const results = await Promise.all(steps);
    if (results.some((result) => result.error)) {
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

  // Anything edited while the download was in flight has to be sent first, or it would be overwritten.
  const edited = before.some(
    (trip) => !failed.has(trip.id) && hasChanges(diffRows(bases[trip.id] && tripToRows(bases[trip.id]), tripToRows(trip))),
  );
  if (getTrips() !== before || edited) {
    return false;
  }

  const remote = tripRows
    .filter((row) => meByTrip.has(row.id))
    .map((row) =>
      rowsToTrip(
        {
          trip: row,
          meId: meByTrip.get(row.id) ?? null,
          families: families.filter((family) => family.trip_id === row.id),
          members: members.filter((member) => member.trip_id === row.id),
          expenses: expenses.filter((expense) => expense.trip_id === row.id),
          payments: payments.filter((payment) => payment.trip_id === row.id),
        },
        row.created_by,
      ),
    );
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
      setState({ status: 'error', error: 'Some changes could not be saved to the server yet.' });
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
  if (!supabase || !userId) {
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

let channel: RealtimeChannel | null = null;

function setSession(session: Session | null) {
  const previousUser = state.session?.user.id;
  setState({ session });
  if (!supabase || session?.user.id === previousUser) {
    return;
  }

  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  if (session) {
    // Row-level security means this only hears about trips the user is on.
    channel = supabase
      .channel('famsplit-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => requestSync(1000))
      .subscribe();
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
      const mine = removedTrip.createdBy === state.session?.user.id;
      removals = [...removals, { tripId: removedTrip.id, mode: mine ? 'delete' : 'leave' }];
      persist();
    }
    requestSync();
  });

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

/** Returns an error message, or null when it worked. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) {
    return 'Sharing is not set up in this build.';
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? describe(error) : null;
}

export async function signUp(email: string, password: string): Promise<{ error?: string; confirmEmail?: boolean }> {
  if (!supabase) {
    return { error: 'Sharing is not set up in this build.' };
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { error: describe(error) };
  }
  // No session means the project still requires the email to be confirmed first.
  return { confirmEmail: data.session === null };
}

export async function signOut() {
  if (!supabase) {
    return;
  }
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
