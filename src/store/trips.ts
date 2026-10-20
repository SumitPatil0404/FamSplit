import { getRandomBytes } from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { FamilyColors } from '@/constants/theme';
import { sampleTrip } from '@/data/sample-trip';
import type { Expense, Family, Member, Payment } from '@/domain';

export type StoredFamily = Family & { color: string };
export type StoredMember = Member & {
  /** Where others can send this person money, e.g. name@bank. */
  upiId?: string;
};
export type StoredExpense = Expense & {
  date: string;
  /** One of the ids in categories.ts; older expenses have none and show a guess from the description. */
  category?: string;
};
export type StoredPayment = Payment & { date: string };

/** One line of the server's record of who changed what. Read-only on the phone. */
export type ActivityEntry = {
  id: number;
  at: string;
  actorMemberId: string | null;
  entity: 'trip' | 'family' | 'member' | 'expense' | 'payment';
  action: 'added' | 'changed' | 'removed';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type StoredTrip = {
  id: string;
  name: string;
  createdAt: string;
  /** Typed in by another family to join this trip. */
  inviteCode: string;
  /** Account that created the trip; unset until the trip has been synced. */
  createdBy?: string;
  /** The member who is using this phone; empty until they have said who they are. */
  meId: string;
  /** Set once the trip is closed: expenses are locked and only payments remain. */
  finalizedAt?: string;
  families: StoredFamily[];
  members: StoredMember[];
  expenses: StoredExpense[];
  payments: StoredPayment[];
  /** Filled in from the server for shared trips. */
  activity?: ActivityEntry[];
};

const TRIPS_KEY = 'famsplit.trips.v1';
const MY_NAME_KEY = 'famsplit.myName';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Eight characters with no look-alikes (no 0/O or 1/I), from a secure random source. */
export function newInviteCode(): string {
  return Array.from(getRandomBytes(8), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function load(): StoredTrip[] {
  try {
    const raw = Storage.getItemSync(TRIPS_KEY);
    const saved: StoredTrip[] = raw ? JSON.parse(raw) : [];
    if (saved.every((trip) => trip.inviteCode)) {
      return saved;
    }
    // Trips saved before sharing existed have no invite code yet.
    const upgraded = saved.map((trip) => (trip.inviteCode ? trip : { ...trip, inviteCode: newInviteCode() }));
    Storage.setItemSync(TRIPS_KEY, JSON.stringify(upgraded));
    return upgraded;
  } catch {
    return [];
  }
}

let trips = load();
const listeners = new Set<() => void>();

export type LocalChange = { removedTrip?: StoredTrip };
let onLocalChange: (change: LocalChange) => void = () => {};

/** Lets the sync engine hear about edits made on this phone, without this file depending on it. */
export function setLocalChangeListener(listener: (change: LocalChange) => void) {
  onLocalChange = listener;
}

function save(next: StoredTrip[]) {
  trips = next;
  Storage.setItemSync(TRIPS_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

function commit(next: StoredTrip[], change: LocalChange = {}) {
  save(next);
  onLocalChange(change);
}

/** Replaces everything with what the server has. Does not count as a local edit. */
export function applyRemoteTrips(next: StoredTrip[]) {
  save(next);
}

export function getTrips(): StoredTrip[] {
  return trips;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTrips(): StoredTrip[] {
  return useSyncExternalStore(subscribe, getTrips, getTrips);
}

export function useTrip(tripId: string): StoredTrip | undefined {
  return useTrips().find((trip) => trip.id === tripId);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function updateTrip(tripId: string, change: (trip: StoredTrip) => StoredTrip) {
  commit(trips.map((trip) => (trip.id === tripId ? change(trip) : trip)));
}

export function getMyName(): string {
  return Storage.getItemSync(MY_NAME_KEY) ?? '';
}

export function createTrip(input: { name: string; myName: string; familyName: string }): string {
  const tripId = newId('trip');
  const familyId = newId('fam');
  const meId = newId('mem');
  Storage.setItemSync(MY_NAME_KEY, input.myName);
  commit([
    {
      id: tripId,
      name: input.name,
      createdAt: new Date().toISOString(),
      inviteCode: newInviteCode(),
      meId,
      families: [{ id: familyId, name: input.familyName, headId: meId, color: FamilyColors[0] }],
      members: [{ id: meId, name: input.myName, familyId }],
      expenses: [],
      payments: [],
    },
    ...trips,
  ]);
  return tripId;
}

/** A ready-made trip so the app can be explored without typing everything in. */
export function createSampleTrip(): string {
  const tripId = newId('trip');
  const now = new Date().toISOString();
  commit([
    {
      id: tripId,
      name: 'Goa trip (sample)',
      createdAt: now,
      inviteCode: newInviteCode(),
      meId: 'rajesh',
      families: sampleTrip.families.map((family, index) => ({
        ...family,
        color: FamilyColors[index % FamilyColors.length],
      })),
      members: sampleTrip.members,
      expenses: sampleTrip.expenses.map((expense) => ({ ...expense, date: now })),
      payments: [],
    },
    ...trips,
  ]);
  return tripId;
}

export function deleteTrip(tripId: string) {
  commit(
    trips.filter((trip) => trip.id !== tripId),
    { removedTrip: trips.find((trip) => trip.id === tripId) },
  );
}

export function renameTrip(tripId: string, name: string) {
  updateTrip(tripId, (trip) => ({ ...trip, name }));
}

export function setMe(tripId: string, memberId: string) {
  updateTrip(tripId, (trip) => ({ ...trip, meId: memberId }));
}

export function finalizeTrip(tripId: string) {
  updateTrip(tripId, (trip) => ({ ...trip, finalizedAt: new Date().toISOString() }));
}

export function reopenTrip(tripId: string) {
  updateTrip(tripId, ({ finalizedAt: _finalizedAt, ...trip }) => trip);
}

/** The trip's creator and the family heads decide when a trip is closed. */
export function canFinalize(trip: StoredTrip, userId: string | undefined): boolean {
  const isHead = trip.families.some((family) => family.headId === trip.meId);
  const isCreator = trip.createdBy === undefined || trip.createdBy === userId;
  return isHead || isCreator;
}

/** True when the member appears in any expense or payment, so removing them would break the books. */
export function isMemberUsed(trip: StoredTrip, memberId: string): boolean {
  const familyId = trip.members.find((member) => member.id === memberId)?.familyId;
  const siblings = trip.members.filter((member) => member.familyId === familyId).length;

  const inExpense = trip.expenses.some((expense) => {
    if (memberId in expense.paidBy) {
      return true;
    }
    switch (expense.split.type) {
      case 'equal':
        return expense.split.memberIds.includes(memberId);
      case 'shares':
        return memberId in expense.split.shares;
      case 'exact':
        return memberId in expense.split.amounts;
      case 'perFamily':
        // A family in a per-family split must keep at least one member.
        return siblings <= 1 && familyId !== undefined && expense.split.familyIds.includes(familyId);
    }
  });

  return (
    inExpense ||
    trip.payments.some((payment) => payment.fromMemberId === memberId || payment.toMemberId === memberId)
  );
}

export function isFamilyUsed(trip: StoredTrip, familyId: string): boolean {
  return (
    trip.expenses.some((expense) => expense.split.type === 'perFamily' && expense.split.familyIds.includes(familyId)) ||
    trip.members.some((member) => member.familyId === familyId && isMemberUsed(trip, member.id))
  );
}

export type FamilyDraft = {
  familyId?: string;
  name: string;
  /** Members without an id are new. */
  members: { id?: string; name: string; upiId?: string }[];
  headIndex: number;
};

export function saveFamily(tripId: string, draft: FamilyDraft) {
  updateTrip(tripId, (trip) => {
    const familyId = draft.familyId ?? newId('fam');
    const members: StoredMember[] = draft.members.map((member) => ({
      id: member.id ?? newId('mem'),
      name: member.name,
      familyId,
      ...(member.upiId ? { upiId: member.upiId } : {}),
    }));
    const headId = members[draft.headIndex].id;
    const others = trip.members.filter((member) => member.familyId !== familyId);

    const families = draft.familyId
      ? trip.families.map((family) => (family.id === familyId ? { ...family, name: draft.name, headId } : family))
      : [
          ...trip.families,
          { id: familyId, name: draft.name, headId, color: FamilyColors[trip.families.length % FamilyColors.length] },
        ];

    return { ...trip, families, members: [...others, ...members] };
  });
}

export function deleteFamily(tripId: string, familyId: string) {
  updateTrip(tripId, (trip) => ({
    ...trip,
    families: trip.families.filter((family) => family.id !== familyId),
    members: trip.members.filter((member) => member.familyId !== familyId),
  }));
}

export function saveExpense(tripId: string, expense: StoredExpense) {
  updateTrip(tripId, (trip) => ({
    ...trip,
    expenses: trip.expenses.some((existing) => existing.id === expense.id)
      ? trip.expenses.map((existing) => (existing.id === expense.id ? expense : existing))
      : [expense, ...trip.expenses],
  }));
}

export function deleteExpense(tripId: string, expenseId: string) {
  updateTrip(tripId, (trip) => ({
    ...trip,
    expenses: trip.expenses.filter((expense) => expense.id !== expenseId),
  }));
}

export function addPayment(tripId: string, payment: { fromMemberId: string; toMemberId: string; amount: number }) {
  updateTrip(tripId, (trip) => ({
    ...trip,
    payments: [{ id: newId('pay'), date: new Date().toISOString(), ...payment }, ...trip.payments],
  }));
}

export function deletePayment(tripId: string, paymentId: string) {
  updateTrip(tripId, (trip) => ({
    ...trip,
    payments: trip.payments.filter((payment) => payment.id !== paymentId),
  }));
}
