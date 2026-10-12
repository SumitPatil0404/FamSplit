import { formatPaise } from '@/domain';

import type { ActivityEntry, StoredTrip } from './trips';

export type ActivityLine = {
  /** Who did it, by member name; "Someone" if they had not said who they are. */
  who: string;
  /** What they did, phrased to follow the name: "added the Patel family". */
  what: string;
  /** Extra detail for edits, such as the old and new amount. */
  detail?: string;
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const amount = (value: unknown) => formatPaise(Number(value) || 0);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Turns one row of the server's log into a sentence. Returns null for changes not worth showing. */
export function describeActivity(entry: ActivityEntry, trip: StoredTrip): ActivityLine | null {
  const memberName = (memberId: unknown) =>
    trip.members.find((member) => member.id === memberId)?.name ?? 'someone who has left';
  const familyName = (familyId: unknown) => trip.families.find((family) => family.id === familyId)?.name;

  const who = entry.actorMemberId
    ? (trip.members.find((member) => member.id === entry.actorMemberId)?.name ?? 'Someone')
    : 'Someone';
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const row = entry.action === 'removed' ? before : after;
  const line = (what: string, detail?: string): ActivityLine => ({ who, what, detail });

  switch (entry.entity) {
    case 'trip':
      if (entry.action === 'added') {
        return line('created the trip');
      }
      if (!before.finalized_at && after.finalized_at) {
        return line('finalised the trip', 'Expenses are locked.');
      }
      if (before.finalized_at && !after.finalized_at) {
        return line('reopened the trip', 'Expenses can be changed again.');
      }
      return before.name !== after.name ? line(`renamed the trip to “${text(after.name)}”`) : null;

    case 'family':
      if (entry.action === 'added') {
        return line(`added the ${text(row.name)} family`);
      }
      if (entry.action === 'removed') {
        return line(`removed the ${text(row.name)} family`);
      }
      if (before.name !== after.name) {
        return line(`renamed the ${text(before.name)} family to ${text(after.name)}`);
      }
      return before.head_id !== after.head_id
        ? line(`made ${memberName(after.head_id)} head of the ${text(after.name)} family`)
        : null;

    case 'member': {
      const family = familyName(row.family_id);
      if (entry.action === 'added') {
        return line(`added ${text(row.name)}${family ? ` to the ${family} family` : ''}`);
      }
      if (entry.action === 'removed') {
        return line(`removed ${text(row.name)}${family ? ` from the ${family} family` : ''}`);
      }
      if (before.name !== after.name) {
        return line(`renamed ${text(before.name)} to ${text(after.name)}`);
      }
      return before.upi_id !== after.upi_id ? line(`updated the UPI ID for ${text(after.name)}`) : null;
    }

    case 'expense': {
      if (entry.action === 'added') {
        return line(`added “${text(row.description)}”`, amount(row.amount));
      }
      if (entry.action === 'removed') {
        return line(`deleted “${text(row.description)}”`, amount(row.amount));
      }
      const changes = [
        before.description !== after.description && `was “${text(before.description)}”`,
        before.amount !== after.amount && `${amount(before.amount)} → ${amount(after.amount)}`,
        !same(before.paid_by, after.paid_by) && 'who paid',
        !same(before.split, after.split) && 'how it is split',
      ].filter((change): change is string => Boolean(change));
      return changes.length > 0 ? line(`changed “${text(after.description)}”`, changes.join(' · ')) : null;
    }

    case 'payment': {
      const parties = `${memberName(row.from_member_id)} → ${memberName(row.to_member_id)}`;
      if (entry.action === 'added') {
        return line(`marked ${parties} as paid`, amount(row.amount));
      }
      return entry.action === 'removed' ? line(`undid the payment ${parties}`, amount(row.amount)) : null;
    }
  }
}
