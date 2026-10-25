import type { SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';

import { msg } from '@/i18n/translate';
import { applyRemotePersonal, getPersonalExpenses, type PersonalExpense } from '@/store/personal';

export type PersonalRow = {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  date: string;
};

export function personalToRow(expense: PersonalExpense): PersonalRow {
  return {
    id: expense.id,
    description: expense.description,
    amount: expense.amount,
    category: expense.category ?? null,
    date: expense.date,
  };
}

export function rowToPersonal(row: PersonalRow): PersonalExpense {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    ...(row.category ? { category: row.category } : {}),
    // The server writes dates its own way; keep them in the form the phone uses.
    date: new Date(row.date).toISOString(),
  };
}

/** What has to be sent: expenses added or changed since the server last had them, and ones deleted. */
export function diffPersonal(base: Record<string, PersonalExpense>, local: PersonalExpense[]) {
  const same = (a: PersonalExpense, b: PersonalExpense) => JSON.stringify(personalToRow(a)) === JSON.stringify(personalToRow(b));
  const localIds = new Set(local.map((expense) => expense.id));
  return {
    upserts: local.filter((expense) => !base[expense.id] || !same(base[expense.id], expense)),
    deletes: Object.keys(base).filter((id) => !localIds.has(id)),
  };
}

const BASE_KEY = 'famsplit.sync.personal.v1';

/** Each personal expense as the server last had it. */
let base: Record<string, PersonalExpense> = (() => {
  try {
    const raw = Storage.getItemSync(BASE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
})();

function setBase(next: Record<string, PersonalExpense>) {
  base = next;
  Storage.setItemSync(BASE_KEY, JSON.stringify(base));
}

const missingTable = (message: string) => /personal_expenses|relation|schema cache|does not exist/i.test(message);

/** Personal expenses added, changed or deleted on this phone that the server does not have yet. */
export function unsentPersonalCount(): number {
  const { upserts, deletes } = diffPersonal(base, getPersonalExpenses());
  return upserts.length + deletes.length;
}

export function hasUnsentPersonal(): boolean {
  return unsentPersonalCount() > 0;
}

/**
 * Sends personal expenses added, changed or deleted on this phone. Returns a problem to show, or
 * null. A database without update-6.sql only matters once there is something to send.
 */
export async function pushPersonal(client: SupabaseClient, userId: string): Promise<string | null> {
  const local = getPersonalExpenses();
  const { upserts, deletes } = diffPersonal(base, local);
  const steps: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (upserts.length > 0) {
    steps.push(
      client.from('personal_expenses').upsert(
        upserts.map((expense) => ({ ...personalToRow(expense), user_id: userId })),
        { onConflict: 'user_id,id' },
      ),
    );
  }
  if (deletes.length > 0) {
    steps.push(client.from('personal_expenses').delete().in('id', deletes));
  }
  const problem = (await Promise.all(steps)).find((result) => result.error)?.error;
  if (problem) {
    if (/network|fetch/i.test(problem.message)) {
      throw problem;
    }
    return missingTable(problem.message)
      ? msg('The database is missing its latest update. Run the newest supabase/update-*.sql file in the Supabase SQL editor.')
      : msg('Some changes could not be saved to the server yet.');
  }
  setBase(Object.fromEntries(local.map((expense) => [expense.id, expense])));
  return null;
}

/** Replaces local personal expenses with the server's. Returns false if the phone was edited meanwhile. */
export async function pullPersonal(client: SupabaseClient): Promise<boolean> {
  const before = getPersonalExpenses();
  const { data, error } = await client.from('personal_expenses').select('id, description, amount, category, date');
  if (error) {
    if (missingTable(error.message)) {
      return true;
    }
    throw error;
  }
  if (getPersonalExpenses() !== before) {
    return false;
  }
  const remote = (data as PersonalRow[]).map(rowToPersonal);
  setBase(Object.fromEntries(remote.map((expense) => [expense.id, expense])));
  applyRemotePersonal(remote);
  return true;
}

/** On sign-out, expenses that are on the server leave the phone; ones never uploaded stay. */
export function forgetPersonal() {
  applyRemotePersonal(getPersonalExpenses().filter((expense) => !base[expense.id]));
  setBase({});
}
