import type { StoredTrip } from '@/store/trips';

import { diffRows, hasChanges, rowsToTrip, tripToRows } from '../rows';

const trip: StoredTrip = {
  id: 't1',
  name: 'Goa',
  createdAt: '2026-10-01T08:00:00.000Z',
  inviteCode: 'ABCD2345',
  createdBy: 'user-a',
  meId: 'm1',
  families: [
    { id: 'f1', name: 'Sharma', headId: 'm1', color: '#6C4DF6' },
    { id: 'f2', name: 'Patel', headId: 'm3', color: '#10B981' },
  ],
  members: [
    { id: 'm1', name: 'Rajesh', familyId: 'f1', upiId: 'rajesh@upi' },
    { id: 'm2', name: 'Sunita', familyId: 'f1' },
    { id: 'm3', name: 'Mahesh', familyId: 'f2' },
  ],
  expenses: [
    {
      id: 'e2',
      description: 'Dinner',
      amount: 84000,
      paidBy: { m3: 50000, m1: 34000 },
      split: { type: 'exact', amounts: { m1: 30000, m2: 24000, m3: 30000 } },
      date: '2026-10-03T19:30:00.000Z',
    },
    {
      id: 'e1',
      description: 'Villa',
      amount: 3600000,
      paidBy: { m1: 3600000 },
      split: { type: 'perFamily', familyIds: ['f1', 'f2'] },
      date: '2026-10-02T10:00:00.000Z',
    },
  ],
  payments: [{ id: 'p1', fromMemberId: 'm3', toMemberId: 'm1', amount: 100000, date: '2026-10-04T09:00:00.000Z' }],
};

const changesBetween = (base: StoredTrip | undefined, next: StoredTrip) =>
  diffRows(base && tripToRows(base), tripToRows(next));

describe('tripToRows and rowsToTrip', () => {
  it('round-trips a trip through database rows', () => {
    expect(rowsToTrip(tripToRows(trip), 'user-a')).toEqual(trip);
  });

  it('restores order from positions and dates, whatever order the database returns', () => {
    const rows = tripToRows(trip);
    const shuffled = {
      ...rows,
      families: [...rows.families].reverse(),
      members: [...rows.members].reverse(),
      expenses: [...rows.expenses].reverse(),
    };
    expect(rowsToTrip(shuffled, 'user-a')).toEqual(trip);
  });

  it('treats a joined trip with no chosen member as having no "me"', () => {
    expect(rowsToTrip({ ...tripToRows(trip), meId: null }, null).meId).toBe('');
    expect(tripToRows({ ...trip, meId: '' }).meId).toBeNull();
  });
});

describe('diffRows', () => {
  it('sends everything for a trip the server has never seen', () => {
    const changes = changesBetween(undefined, trip);
    expect(changes.isNew).toBe(true);
    expect(changes.meChanged).toBe(true);
    expect(changes.families.upserts).toHaveLength(2);
    expect(changes.members.upserts).toHaveLength(3);
    expect(changes.expenses.upserts).toHaveLength(2);
    expect(changes.payments.upserts).toHaveLength(1);
  });

  it('sends nothing when nothing changed', () => {
    expect(hasChanges(changesBetween(trip, trip))).toBe(false);
  });

  it('ignores how the database formats timestamps and orders JSON keys', () => {
    const rows = tripToRows(trip);
    const fromServer = rowsToTrip(
      {
        ...rows,
        trip: { ...rows.trip, created_at: '2026-10-01T08:00:00+00:00' },
        expenses: rows.expenses.map((expense) => ({
          ...expense,
          date: expense.date.replace('.000Z', '+00:00'),
          paid_by: Object.fromEntries(Object.entries(expense.paid_by).reverse()),
        })),
      },
      'user-a',
    );
    expect(hasChanges(changesBetween(fromServer, trip))).toBe(false);
  });

  it('sends only the rows that were edited, added or removed', () => {
    const edited: StoredTrip = {
      ...trip,
      expenses: [
        { ...trip.expenses[0], description: 'Dinner at the beach' },
        trip.expenses[1],
        { id: 'e3', description: 'Cab', amount: 45000, paidBy: { m2: 45000 }, split: { type: 'equal', memberIds: ['m1', 'm2', 'm3'] }, date: '2026-10-05T07:00:00.000Z' },
      ],
      payments: [],
    };
    const changes = changesBetween(trip, edited);

    expect(changes.isNew).toBe(false);
    expect(changes.renamed).toBe(false);
    expect(changes.expenses.upserts.map((row) => row.id)).toEqual(['e2', 'e3']);
    expect(changes.expenses.deletes).toEqual([]);
    expect(changes.payments).toEqual({ upserts: [], deletes: ['p1'] });
    expect(changes.families).toEqual({ upserts: [], deletes: [] });
    expect(changes.members).toEqual({ upserts: [], deletes: [] });
  });

  it('notices a rename, a new head and a change of "me"', () => {
    const changes = changesBetween(trip, {
      ...trip,
      name: 'Goa 2026',
      meId: 'm2',
      families: [{ ...trip.families[0], headId: 'm2' }, trip.families[1]],
    });
    expect(changes.renamed).toBe(true);
    expect(changes.meChanged).toBe(true);
    expect(changes.families.upserts.map((row) => row.id)).toEqual(['f1']);
  });

  it('notices finalising, reopening and a changed UPI id', () => {
    const finalised = { ...trip, finalizedAt: '2026-10-06T12:00:00.000Z' };
    expect(changesBetween(trip, finalised).finalizedChanged).toBe(true);
    expect(changesBetween(finalised, trip).finalizedChanged).toBe(true);
    expect(rowsToTrip(tripToRows(finalised), 'user-a')).toEqual(finalised);

    const changes = changesBetween(trip, { ...trip, members: [{ ...trip.members[0], upiId: undefined }, ...trip.members.slice(1)] });
    expect(changes.members.upserts).toEqual([expect.objectContaining({ id: 'm1', upi_id: null })]);
  });

  it('re-sends later rows when one is removed from the middle of the order', () => {
    const changes = changesBetween(trip, { ...trip, members: [trip.members[0], trip.members[2]] });
    expect(changes.members.deletes).toEqual(['m2']);
    expect(changes.members.upserts.map((row) => row.id)).toEqual(['m3']);
  });
});
