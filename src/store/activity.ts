import { formatPaise } from '@/domain';
import { englishT, type T } from '@/i18n/translate';

import type { ActivityEntry, StoredTrip } from './trips';

/** Decides the colour and icon of the line, so additions, edits, deletions and payments stand apart. */
export type ActivityKind = 'added' | 'changed' | 'removed' | 'paid' | 'finalised' | 'reopened';

export type ActivityLine = {
  kind: ActivityKind;
  /** Who did it, by member name; "Someone" if they had not said who they are. */
  who: string;
  /** The whole sentence, which contains `who`: "Mahesh added the Patel family". */
  what: string;
  /** Extra detail for edits, such as the old and new amount. */
  detail?: string;
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const amount = (value: unknown) => formatPaise(Number(value) || 0);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Turns one row of the server's log into a sentence. Returns null for changes not worth showing. */
export function describeActivity(entry: ActivityEntry, trip: StoredTrip, t: T = englishT): ActivityLine | null {
  const memberName = (memberId: unknown) =>
    trip.members.find((member) => member.id === memberId)?.name ?? t('someone who has left');
  const familyName = (familyId: unknown) => trip.families.find((family) => family.id === familyId)?.name;

  const who = entry.actorMemberId
    ? (trip.members.find((member) => member.id === entry.actorMemberId)?.name ?? t('Somebody'))
    : t('Somebody');
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const row = entry.action === 'removed' ? before : after;
  const line = (kind: ActivityKind, what: string, detail?: string): ActivityLine => ({ kind, who, what, detail });

  switch (entry.entity) {
    case 'trip':
      if (entry.action === 'added') {
        return line('added', t('{who} created the trip', { who }));
      }
      if (!before.finalized_at && after.finalized_at) {
        return line('finalised', t('{who} finalised the trip', { who }), t('Expenses are locked.'));
      }
      if (before.finalized_at && !after.finalized_at) {
        return line('reopened', t('{who} reopened the trip', { who }), t('Expenses can be changed again.'));
      }
      return before.name !== after.name ? line('changed', t('{who} renamed the trip to “{name}”', { who, name: text(after.name) })) : null;

    case 'family':
      // On a friends trip each person is a family of one, and the person's own line says it all.
      if (trip.kind === 'friends') {
        return null;
      }
      if (entry.action === 'added') {
        return line('added', t('{who} added the {name} family', { who, name: text(row.name) }));
      }
      if (entry.action === 'removed') {
        return line('removed', t('{who} removed the {name} family', { who, name: text(row.name) }));
      }
      if (before.name !== after.name) {
        return line('changed', t('{who} renamed the {old} family to {name}', { who, old: text(before.name), name: text(after.name) }));
      }
      return before.head_id !== after.head_id
        ? line('changed', t('{who} made {person} head of the {name} family', { who, person: memberName(after.head_id), name: text(after.name) }))
        : null;

    case 'member': {
      const family = trip.kind === 'friends' ? undefined : familyName(row.family_id);
      if (entry.action === 'added') {
        return line(
          'added',
          family
            ? t('{who} added {name} to the {family} family', { who, name: text(row.name), family })
            : t('{who} added {name}', { who, name: text(row.name) }),
        );
      }
      if (entry.action === 'removed') {
        return line(
          'removed',
          family
            ? t('{who} removed {name} from the {family} family', { who, name: text(row.name), family })
            : t('{who} removed {name}', { who, name: text(row.name) }),
        );
      }
      if (before.name !== after.name) {
        return line('changed', t('{who} renamed {old} to {name}', { who, old: text(before.name), name: text(after.name) }));
      }
      return before.upi_id !== after.upi_id ? line('changed', t('{who} updated the UPI ID for {name}', { who, name: text(after.name) })) : null;
    }

    case 'expense': {
      if (entry.action === 'added') {
        return line('added', t('{who} added “{name}”', { who, name: text(row.description) }), amount(row.amount));
      }
      if (entry.action === 'removed') {
        return line('removed', t('{who} deleted “{name}”', { who, name: text(row.description) }), amount(row.amount));
      }
      const changes = [
        before.description !== after.description && t('was “{name}”', { name: text(before.description) }),
        before.amount !== after.amount && `${amount(before.amount)} → ${amount(after.amount)}`,
        !same(before.paid_by, after.paid_by) && t('who paid'),
        !same(before.split, after.split) && t('how it is split'),
        (before.category ?? null) !== (after.category ?? null) && t('category'),
      ].filter((change): change is string => Boolean(change));
      return changes.length > 0 ? line('changed', t('{who} changed “{name}”', { who, name: text(after.description) }), changes.join(' · ')) : null;
    }

    case 'payment': {
      const parties = `${memberName(row.from_member_id)} → ${memberName(row.to_member_id)}`;
      if (entry.action === 'added') {
        return line('paid', t('{who} marked {parties} as paid', { who, parties }), amount(row.amount));
      }
      return entry.action === 'removed' ? line('removed', t('{who} undid the payment {parties}', { who, parties }), amount(row.amount)) : null;
    }
  }
}
