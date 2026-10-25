import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import type { Paise } from '@/domain';

/** Money spent outside any trip. Only its owner sees it; it is synced to their account but never shared. */
export type PersonalExpense = {
  id: string;
  description: string;
  amount: Paise;
  /** One of the ids in categories.ts. */
  category?: string;
  date: string;
};

const PERSONAL_KEY = 'famsplit.personal.v1';

function load(): PersonalExpense[] {
  try {
    const raw = Storage.getItemSync(PERSONAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

let expenses = load();
const listeners = new Set<() => void>();
let onLocalChange: () => void = () => {};

/** Lets the sync engine hear about edits made on this phone, without this file depending on it. */
export function setPersonalChangeListener(listener: () => void) {
  onLocalChange = listener;
}

function save(next: PersonalExpense[]) {
  expenses = [...next].sort((a, b) => b.date.localeCompare(a.date));
  Storage.setItemSync(PERSONAL_KEY, JSON.stringify(expenses));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Newest first. */
export function getPersonalExpenses(): PersonalExpense[] {
  return expenses;
}

export function usePersonalExpenses(): PersonalExpense[] {
  return useSyncExternalStore(subscribe, getPersonalExpenses, getPersonalExpenses);
}

export function savePersonalExpense(expense: PersonalExpense) {
  save([expense, ...expenses.filter((existing) => existing.id !== expense.id)]);
  onLocalChange();
}

export function deletePersonalExpense(id: string) {
  save(expenses.filter((expense) => expense.id !== id));
  onLocalChange();
}

/** Replaces everything with what the server has. Does not count as a local edit. */
export function applyRemotePersonal(next: PersonalExpense[]) {
  save(next);
}
