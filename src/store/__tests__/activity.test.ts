import { upiLink } from '@/domain';
import { buildSummaryHtml } from '@/export/summary';

import { describeActivity } from '../activity';
import { categoryOf, guessCategory } from '../categories';
import { byCategory, headFlows, spendingScopes } from '../insights';
import { summarizeTrip } from '../summary';
import type { ActivityEntry, StoredTrip } from '../trips';

const trip: StoredTrip = {
  id: 't1',
  name: 'Goa <2026>',
  createdAt: '2026-10-01T08:00:00.000Z',
  inviteCode: 'ABCD2345',
  meId: 'm1',
  families: [
    { id: 'f1', name: 'Sharma', headId: 'm1', color: '#6C4DF6' },
    { id: 'f2', name: 'Patel', headId: 'm3', color: '#10B981' },
  ],
  members: [
    { id: 'm1', name: 'Rajesh', familyId: 'f1' },
    { id: 'm2', name: 'Sunita', familyId: 'f1' },
    { id: 'm3', name: 'Mahesh', familyId: 'f2' },
  ],
  expenses: [
    {
      id: 'e1',
      description: 'Villa',
      amount: 3600000,
      paidBy: { m1: 3600000 },
      split: { type: 'perFamily', familyIds: ['f1', 'f2'] },
      date: '2026-10-02T10:00:00.000Z',
    },
  ],
  payments: [{ id: 'p1', fromMemberId: 'm3', toMemberId: 'm1', amount: 1000000, date: '2026-10-04T09:00:00.000Z' }],
};

const entry = (partial: Partial<ActivityEntry>): ActivityEntry => ({
  id: 1,
  at: '2026-10-03T10:00:00.000Z',
  actorMemberId: 'm3',
  entity: 'expense',
  action: 'added',
  before: null,
  after: null,
  ...partial,
});

describe('describeActivity', () => {
  it('names who did it, or says Someone when they had not picked themselves', () => {
    const added = { after: { description: 'Dinner', amount: 840000 } };
    expect(describeActivity(entry(added), trip)).toEqual({ kind: 'added', who: 'Mahesh', what: 'Mahesh added “Dinner”', detail: '₹8,400' });
    expect(describeActivity(entry({ ...added, actorMemberId: null }), trip)?.who).toBe('Somebody');
  });

  it('spells out what changed in an edited expense', () => {
    const line = describeActivity(
      entry({
        action: 'changed',
        before: { description: 'Dinner', amount: 840000, paid_by: { m1: 840000 }, split: { type: 'equal', memberIds: ['m1'] } },
        after: { description: 'Dinner', amount: 900000, paid_by: { m3: 900000 }, split: { type: 'equal', memberIds: ['m1'] } },
      }),
      trip,
    );
    expect(line).toEqual({ kind: 'changed', who: 'Mahesh', what: 'Mahesh changed “Dinner”', detail: '₹8,400 → ₹9,000 · who paid' });
  });

  it('describes deletions, payments, finalising and people', () => {
    const what = (partial: Partial<ActivityEntry>) => describeActivity(entry(partial), trip)?.what;
    expect(what({ action: 'removed', before: { description: 'Cab', amount: 45000 } })).toBe('Mahesh deleted “Cab”');
    expect(what({ entity: 'payment', after: { from_member_id: 'm3', to_member_id: 'm1', amount: 100 } })).toBe(
      'Mahesh marked Mahesh → Rajesh as paid',
    );
    expect(what({ entity: 'payment', action: 'removed', before: { from_member_id: 'm3', to_member_id: 'gone', amount: 100 } })).toBe(
      'Mahesh undid the payment Mahesh → someone who has left',
    );
    expect(what({ entity: 'trip', action: 'changed', before: { finalized_at: null }, after: { finalized_at: '2026-10-05' } })).toBe(
      'Mahesh finalised the trip',
    );
    expect(what({ entity: 'trip', action: 'changed', before: { finalized_at: '2026-10-05' }, after: { finalized_at: null } })).toBe(
      'Mahesh reopened the trip',
    );
    expect(what({ entity: 'family', action: 'changed', before: { name: 'Patel', head_id: 'm3' }, after: { name: 'Patel', head_id: 'm1' } })).toBe(
      'Mahesh made Rajesh head of the Patel family',
    );
    expect(what({ entity: 'member', after: { name: 'Dadi', family_id: 'f2' } })).toBe('Mahesh added Dadi to the Patel family');
  });

  it('tags each line with its kind so the log can colour it', () => {
    const kind = (partial: Partial<ActivityEntry>) => describeActivity(entry(partial), trip)?.kind;
    expect(kind({ after: { description: 'Cab', amount: 45000 } })).toBe('added');
    expect(kind({ action: 'removed', before: { description: 'Cab', amount: 45000 } })).toBe('removed');
    expect(kind({ action: 'changed', before: { description: 'Cab', category: null }, after: { description: 'Cab', category: 'cab' } })).toBe(
      'changed',
    );
    expect(kind({ entity: 'payment', after: { from_member_id: 'm3', to_member_id: 'm1', amount: 100 } })).toBe('paid');
    expect(kind({ entity: 'trip', action: 'changed', before: { finalized_at: null }, after: { finalized_at: '2026-10-05' } })).toBe(
      'finalised',
    );
  });

  it('skips changes that are not worth a line', () => {
    const same = { name: 'Patel', head_id: 'm3', color: '#10B981' };
    expect(describeActivity(entry({ entity: 'family', action: 'changed', before: same, after: { ...same, color: '#000000' } }), trip)).toBeNull();
  });
});

describe('buildSummaryHtml', () => {
  const html = buildSummaryHtml(trip, '2026-10-06T00:00:00.000Z');

  it('shows totals, each family, and what is still owed after payments', () => {
    expect(html).toContain('Total spent: ₹36,000');
    expect(html).toContain('Sharma (head: Rajesh)');
    // Patel owed ₹18,000 for half the villa and has paid ₹10,000 of it.
    expect(html).toContain('Owes ₹8,000');
    expect(html).toContain('Gets back ₹8,000');
    expect(html).toMatch(/Mahesh \(Patel\)<\/td><td>Rajesh \(Sharma\)<\/td><td class="amount">₹8,000/);
    expect(html).toContain('Per family');
  });

  it('escapes names so they cannot break the page', () => {
    expect(html).toContain('Goa &lt;2026&gt;');
    expect(html).not.toContain('Goa <2026>');
  });
});

describe('summarizeTrip', () => {
  it('gives balances for a complete trip', () => {
    const summary = summarizeTrip(trip);
    expect(summary.incomplete).toBe(false);
    expect(summary.myFamilyNet).toBe(800000);
    expect(summary.totalSpent).toBe(3600000);
  });

  it('does not crash on a trip that is only half downloaded', () => {
    // The Patel family has arrived but its members have not.
    const half = { ...trip, members: trip.members.filter((member) => member.familyId === 'f1') };
    const summary = summarizeTrip(half);
    expect(summary.incomplete).toBe(true);
    expect(summary.settlement.betweenFamilies).toEqual([]);
    expect(summary.myFamilyNet).toBe(0);
  });
});

describe('upiLink', () => {
  it('builds a standard UPI payment link with the amount in rupees', () => {
    expect(upiLink('ravi@okbank', 'Ravi Kumar', 25050, 'FamSplit: Goa & Gokarna')).toBe(
      'upi://pay?pa=ravi@okbank&pn=Ravi%20Kumar&am=250.50&cu=INR&tn=FamSplit%3A%20Goa%20%26%20Gokarna',
    );
  });
});

describe('categories', () => {
  it('guesses from the description until one is picked', () => {
    expect(guessCategory('Dinner at the beach shack').id).toBe('food');
    expect(guessCategory('Ola to airport').id).toBe('cab');
    expect(guessCategory('Something odd').id).toBe('other');
    expect(categoryOf({ description: 'Dinner', category: 'party' }).id).toBe('party');
    expect(categoryOf({ description: 'Dinner', category: 'retired-id' }).id).toBe('food');
  });
});

describe('friends trips', () => {
  const friends: StoredTrip = {
    ...trip,
    kind: 'friends',
    families: [
      { id: 'f1', name: 'Rajesh', headId: 'm1', color: '#6C4DF6' },
      { id: 'f2', name: 'Sunita', headId: 'm2', color: '#10B981' },
      { id: 'f3', name: 'Mahesh', headId: 'm3', color: '#F59E0B' },
    ],
    members: [
      { id: 'm1', name: 'Rajesh', familyId: 'f1' },
      { id: 'm2', name: 'Sunita', familyId: 'f2' },
      { id: 'm3', name: 'Mahesh', familyId: 'f3' },
    ],
    expenses: [
      {
        id: 'e1',
        description: 'Villa',
        amount: 900000,
        paidBy: { m1: 900000 },
        split: { type: 'equal', memberIds: ['m1', 'm2', 'm3'] },
        date: '2026-10-02T10:00:00.000Z',
      },
    ],
    payments: [],
  };

  it('settles person to person, with nothing left inside any family', () => {
    const { settlement } = summarizeTrip(friends);
    expect(settlement.betweenFamilies.map(({ fromMemberId, toMemberId, amount }) => [fromMemberId, toMemberId, amount])).toEqual([
      ['m2', 'm1', 300000],
      ['m3', 'm1', 300000],
    ]);
    expect([...settlement.withinFamily.values()].flat()).toEqual([]);
  });

  it('describes people without families in the log', () => {
    const what = (partial: Partial<ActivityEntry>) => describeActivity(entry(partial), friends)?.what ?? null;
    expect(what({ entity: 'member', after: { name: 'Dadi', family_id: 'f2' } })).toBe('Mahesh added Dadi');
    expect(what({ entity: 'family', after: { name: 'Dadi' } })).toBeNull();
  });

  it('prints people instead of families in the PDF', () => {
    const html = buildSummaryHtml(friends, '2026-10-06T00:00:00.000Z');
    expect(html).toContain('<h2>People</h2>');
    expect(html).not.toContain('inside each family');
    expect(html).toMatch(/Sunita<\/td><td>Rajesh<\/td><td class="amount">₹3,000/);
  });
});

describe('insights', () => {
  it('adds up spending per category, for the trip or one family’s share', () => {
    const [all, sharma, patel] = spendingScopes(trip);
    expect(sharma.label).toBe('Sharma (you)');
    expect(byCategory(trip, all)).toEqual([expect.objectContaining({ amount: 3600000, count: 1 })]);
    expect(byCategory(trip, all)[0].category.id).toBe('stay');
    expect(byCategory(trip, patel)[0].amount).toBe(1800000);
  });

  it('shows what each head still collects and hands out', () => {
    const { settlement } = summarizeTrip(trip);
    // Sunita owes Rajesh half the Sharma share; Mahesh still owes Rajesh ₹8,000 after paying ₹10,000.
    expect(headFlows(trip, settlement)).toEqual([
      { familyId: 'f1', headId: 'm1', collectsFromFamily: 900000, handsOutToFamily: 0, receivesFromFamilies: 800000, paysToFamilies: 0 },
      { familyId: 'f2', headId: 'm3', collectsFromFamily: 0, handsOutToFamily: 0, receivesFromFamilies: 0, paysToFamilies: 800000 },
    ]);
  });
});
