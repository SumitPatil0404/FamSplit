import { upiLink } from '@/domain';
import { buildSummaryHtml } from '@/export/summary';

import { describeActivity } from '../activity';
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
    expect(describeActivity(entry(added), trip)).toEqual({ who: 'Mahesh', what: 'added “Dinner”', detail: '₹8,400' });
    expect(describeActivity(entry({ ...added, actorMemberId: null }), trip)?.who).toBe('Someone');
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
    expect(line).toEqual({ who: 'Mahesh', what: 'changed “Dinner”', detail: '₹8,400 → ₹9,000 · who paid' });
  });

  it('describes deletions, payments, finalising and people', () => {
    const what = (partial: Partial<ActivityEntry>) => describeActivity(entry(partial), trip)?.what;
    expect(what({ action: 'removed', before: { description: 'Cab', amount: 45000 } })).toBe('deleted “Cab”');
    expect(what({ entity: 'payment', after: { from_member_id: 'm3', to_member_id: 'm1', amount: 100 } })).toBe(
      'marked Mahesh → Rajesh as paid',
    );
    expect(what({ entity: 'payment', action: 'removed', before: { from_member_id: 'm3', to_member_id: 'gone', amount: 100 } })).toBe(
      'undid the payment Mahesh → someone who has left',
    );
    expect(what({ entity: 'trip', action: 'changed', before: { finalized_at: null }, after: { finalized_at: '2026-10-05' } })).toBe(
      'finalised the trip',
    );
    expect(what({ entity: 'trip', action: 'changed', before: { finalized_at: '2026-10-05' }, after: { finalized_at: null } })).toBe(
      'reopened the trip',
    );
    expect(what({ entity: 'family', action: 'changed', before: { name: 'Patel', head_id: 'm3' }, after: { name: 'Patel', head_id: 'm1' } })).toBe(
      'made Rajesh head of the Patel family',
    );
    expect(what({ entity: 'member', after: { name: 'Dadi', family_id: 'f2' } })).toBe('added Dadi to the Patel family');
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
      'upi://pay?pa=ravi%40okbank&pn=Ravi%20Kumar&am=250.50&cu=INR&tn=FamSplit%3A%20Goa%20%26%20Gokarna',
    );
  });
});
