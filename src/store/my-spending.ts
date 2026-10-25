import { expenseShares, type Paise } from '@/domain';

import { categoryOf, type Category } from './categories';
import type { CategoryRow } from './insights';
import type { PersonalExpense } from './personal';
import { isFriendsTrip } from './trip-kind';
import type { StoredTrip } from './trips';

/** One thing this phone's owner spent money on, from a trip or from their personal expenses. */
export type SpendingEntry = {
  key: string;
  date: string;
  /** All of a personal expense; on a trip, what this person's family owes of it, whoever paid. */
  amount: Paise;
  description: string;
  category: Category;
  source:
    | { kind: 'personal'; expenseId: string }
    /** `friends` says whether the amount is this person's own share or their family's. */
    | { kind: 'trip'; tripId: string; tripName: string; expenseId: string; friends: boolean };
};

export type SpendingView = 'personal' | 'everything';

/**
 * This phone's owner's part of each trip expense. On a family trip that is the whole family's
 * share, since one person usually pays for the family; on a friends trip each person is a family of
 * one, so it is their own share. Payments between people are not spending and are left out.
 */
export function tripSpending(trip: StoredTrip): SpendingEntry[] {
  const familyId = trip.members.find((member) => member.id === trip.meId)?.familyId;
  if (!familyId) {
    return [];
  }
  const ours = new Set(trip.members.filter((member) => member.familyId === familyId).map((member) => member.id));
  const entries: SpendingEntry[] = [];
  for (const expense of trip.expenses) {
    let shares: Map<string, Paise>;
    try {
      shares = expenseShares(expense, trip);
    } catch {
      // A trip still downloading can have an expense whose people have not arrived yet.
      continue;
    }
    let amount = 0;
    shares.forEach((share, memberId) => {
      if (ours.has(memberId)) {
        amount += share;
      }
    });
    if (amount > 0) {
      entries.push({
        key: `${trip.id}/${expense.id}`,
        date: expense.date,
        amount,
        description: expense.description,
        category: categoryOf(expense),
        source: { kind: 'trip', tripId: trip.id, tripName: trip.name, expenseId: expense.id, friends: isFriendsTrip(trip) },
      });
    }
  }
  return entries;
}

export function personalSpending(expenses: PersonalExpense[]): SpendingEntry[] {
  return expenses.map((expense) => ({
    key: `personal/${expense.id}`,
    date: expense.date,
    amount: expense.amount,
    description: expense.description,
    category: categoryOf(expense),
    source: { kind: 'personal', expenseId: expense.id },
  }));
}

/** Newest first. */
export function spendingEntries(view: SpendingView, trips: StoredTrip[], personal: PersonalExpense[]): SpendingEntry[] {
  const entries = [...personalSpending(personal), ...(view === 'everything' ? trips.flatMap(tripSpending) : [])];
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/** "2026-10", in the phone's own time zone, so a late-night expense lands in the right month. */
export function monthKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(key: string, by: number): string {
  const [year, month] = key.split('-').map(Number);
  return monthKey(new Date(year, month - 1 + by, 1).toISOString());
}

export type MonthSummary = {
  total: Paise;
  personal: Paise;
  trips: Paise;
  /** How many different trips had spending this month. */
  tripCount: number;
  /** The same view's total for the month before, to compare with. */
  previousTotal: Paise;
  byCategory: CategoryRow[];
  entries: SpendingEntry[];
};

export function monthSummary(entries: SpendingEntry[], month: string): MonthSummary {
  const sum = (list: SpendingEntry[]) => list.reduce((total, entry) => total + entry.amount, 0);
  const inMonth = entries.filter((entry) => monthKey(entry.date) === month);
  const fromTrips = inMonth.filter((entry) => entry.source.kind === 'trip');
  const categories = new Map<string, CategoryRow>();
  for (const entry of inMonth) {
    const row = categories.get(entry.category.id) ?? { category: entry.category, amount: 0, count: 0 };
    categories.set(entry.category.id, { ...row, amount: row.amount + entry.amount, count: row.count + 1 });
  }
  return {
    total: sum(inMonth),
    personal: sum(inMonth) - sum(fromTrips),
    trips: sum(fromTrips),
    tripCount: new Set(fromTrips.map((entry) => (entry.source.kind === 'trip' ? entry.source.tripId : ''))).size,
    previousTotal: sum(entries.filter((entry) => monthKey(entry.date) === shiftMonth(month, -1))),
    byCategory: [...categories.values()].sort((a, b) => b.amount - a.amount),
    entries: inMonth,
  };
}
