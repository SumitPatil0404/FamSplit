import { monthKey, monthSummary, shiftMonth, spendingEntries, tripSpending } from '../my-spending';
import type { PersonalExpense } from '../personal';
import type { StoredTrip } from '../trips';

// The Sharma family (Rajesh on this phone, and Priya) travels with the Patels (Rahul).
const familyTrip: StoredTrip = {
  id: 'goa',
  name: 'Goa',
  createdAt: '2026-10-01T08:00:00.000Z',
  inviteCode: 'ABCD2345',
  meId: 'm1',
  families: [
    { id: 'f1', name: 'Sharma', headId: 'm1', color: '#6C4DF6' },
    { id: 'f2', name: 'Patel', headId: 'm3', color: '#10B981' },
  ],
  members: [
    { id: 'm1', name: 'Rajesh', familyId: 'f1' },
    { id: 'm2', name: 'Priya', familyId: 'f1' },
    { id: 'm3', name: 'Rahul', familyId: 'f2' },
  ],
  expenses: [
    // Rahul paid; the Sharmas' share is two of three people.
    { id: 'hotel', date: '2026-10-05T10:00:00.000Z', description: 'Hotel', amount: 300000, paidBy: { m3: 300000 }, split: { type: 'equal', memberIds: ['m1', 'm2', 'm3'] }, category: 'stay' },
    // Only the Patels: nothing of it is the Sharmas'.
    { id: 'patel-dinner', date: '2026-10-06T19:00:00.000Z', description: 'Patel dinner', amount: 80000, paidBy: { m3: 80000 }, split: { type: 'equal', memberIds: ['m3'] } },
  ],
  payments: [{ id: 'pay', date: '2026-10-07T09:00:00.000Z', fromMemberId: 'm1', toMemberId: 'm3', amount: 200000 }],
};

// On a friends trip each person is a family of one.
const friendsTrip: StoredTrip = {
  id: 'manali',
  name: 'Manali',
  kind: 'friends',
  createdAt: '2026-09-01T08:00:00.000Z',
  inviteCode: 'EFGH2345',
  meId: 'a',
  families: [
    { id: 'fa', name: 'Asha', headId: 'a', color: '#6C4DF6' },
    { id: 'fb', name: 'Ben', headId: 'b', color: '#10B981' },
  ],
  members: [
    { id: 'a', name: 'Asha', familyId: 'fa' },
    { id: 'b', name: 'Ben', familyId: 'fb' },
  ],
  expenses: [
    // Asha paid ₹1,000 for both; her own spending is half.
    { id: 'cab', date: '2026-09-28T09:00:00.000Z', description: 'Cab', amount: 100000, paidBy: { a: 100000 }, split: { type: 'equal', memberIds: ['a', 'b'] }, category: 'cab' },
  ],
  payments: [],
};

const personal: PersonalExpense[] = [
  { id: 'p1', description: 'Groceries', amount: 45000, category: 'groceries', date: '2026-10-20T06:30:00.000Z' },
  { id: 'p2', description: 'Phone bill', amount: 59900, date: '2026-09-15T06:30:00.000Z' },
];

describe('tripSpending', () => {
  it('counts the family’s share on a family trip, whoever paid, and leaves out payments', () => {
    expect(tripSpending(familyTrip).map((entry) => [entry.description, entry.amount])).toEqual([['Hotel', 200000]]);
  });

  it('counts only your own share on a friends trip, even when you paid for everyone', () => {
    expect(tripSpending(friendsTrip).map((entry) => [entry.description, entry.amount])).toEqual([['Cab', 50000]]);
  });

  it('has nothing for a trip where the phone has not said who it is', () => {
    expect(tripSpending({ ...familyTrip, meId: '' })).toEqual([]);
  });
});

describe('spendingEntries', () => {
  it('shows only personal expenses in the personal view, and everything newest first otherwise', () => {
    expect(spendingEntries('personal', [familyTrip], personal).map((entry) => entry.description)).toEqual(['Groceries', 'Phone bill']);
    expect(spendingEntries('everything', [familyTrip, friendsTrip], personal).map((entry) => entry.description)).toEqual([
      'Groceries',
      'Hotel',
      'Cab',
      'Phone bill',
    ]);
  });
});

describe('monthSummary', () => {
  const entries = spendingEntries('everything', [familyTrip, friendsTrip], personal);

  it('splits the month into personal and trips, compares with the month before, and groups by category', () => {
    const october = monthSummary(entries, '2026-10');
    expect(october).toMatchObject({ total: 245000, personal: 45000, trips: 200000, tripCount: 1, previousTotal: 109900 });
    expect(october.byCategory.map((row) => [row.category.id, row.amount])).toEqual([
      ['stay', 200000],
      ['groceries', 45000],
    ]);
  });

  it('is empty for a month with nothing in it', () => {
    expect(monthSummary(entries, '2026-12')).toMatchObject({ total: 0, tripCount: 0, entries: [] });
  });
});

describe('months', () => {
  it('steps across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(monthKey(new Date(2026, 9, 31, 23, 30).toISOString())).toBe('2026-10');
  });
});
