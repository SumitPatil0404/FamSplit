import { expenseShares, type Paise, type TripSettlement } from '@/domain';
import { englishT, type T } from '@/i18n/translate';

import { categoryOf, type Category } from './categories';
import { isFriendsTrip } from './trip-kind';
import type { StoredTrip } from './trips';

export type Scope = { id: string; label: string; caption: string; memberIds: Set<string> | null };

/** The whole trip, then each family (or each person on a friends trip), with this phone's owner first. */
export function spendingScopes(trip: StoredTrip, t: T = englishT): Scope[] {
  const myFamilyId = trip.members.find((member) => member.id === trip.meId)?.familyId;
  const friends = isFriendsTrip(trip);
  const groups = [...trip.families].sort((a, b) => Number(b.id === myFamilyId) - Number(a.id === myFamilyId));
  return [
    { id: 'all', label: t('Whole trip'), caption: t('TOTAL SPENT ON THE TRIP'), memberIds: null },
    ...groups.map((family) => {
      const mine = family.id === myFamilyId;
      return {
        id: family.id,
        label: friends ? (mine ? t('You') : family.name) : mine ? t('{name} (you)', { name: family.name }) : family.name,
        caption: (friends
          ? mine
            ? t('Your share')
            : t('{name}’s share', { name: family.name })
          : t('{name} family’s share', { name: family.name })
        ).toUpperCase(),
        memberIds: new Set(trip.members.filter((member) => member.familyId === family.id).map((member) => member.id)),
      };
    }),
  ];
}

export type CategoryRow = { category: Category; amount: Paise; count: number };

/** Spending per category: whole expenses for the trip, or the scope's share of each expense. */
export function byCategory(trip: StoredTrip, scope: Scope): CategoryRow[] {
  const rows = new Map<string, CategoryRow>();
  for (const expense of trip.expenses) {
    let amount = expense.amount;
    if (scope.memberIds) {
      let shares: Map<string, Paise>;
      try {
        shares = expenseShares(expense, trip);
      } catch {
        continue;
      }
      amount = 0;
      shares.forEach((share, memberId) => {
        if (scope.memberIds?.has(memberId)) {
          amount += share;
        }
      });
    }
    if (amount <= 0) {
      continue;
    }
    const category = categoryOf(expense);
    const row = rows.get(category.id) ?? { category, amount: 0, count: 0 };
    rows.set(category.id, { ...row, amount: row.amount + amount, count: row.count + 1 });
  }
  return [...rows.values()].sort((a, b) => b.amount - a.amount);
}

export type HeadFlow = {
  familyId: string;
  headId: string;
  /** From the family's own members, to settle inside the family. */
  collectsFromFamily: Paise;
  handsOutToFamily: Paise;
  /** From and to the other families' heads. */
  receivesFromFamilies: Paise;
  paysToFamilies: Paise;
};

/**
 * On a family trip, each head is where the family's money passes through: what they still
 * collect and hand out, inside the family and between families, until everything is paid.
 */
export function headFlows(trip: StoredTrip, settlement: TripSettlement): HeadFlow[] {
  return trip.families
    .map((family) => {
      const inside = settlement.withinFamily.get(family.id) ?? [];
      const sum = (amounts: Paise[]) => amounts.reduce((total, amount) => total + amount, 0);
      return {
        familyId: family.id,
        headId: family.headId,
        collectsFromFamily: sum(inside.filter((t) => t.toMemberId === family.headId).map((t) => t.amount)),
        handsOutToFamily: sum(inside.filter((t) => t.fromMemberId === family.headId).map((t) => t.amount)),
        receivesFromFamilies: sum(
          settlement.betweenFamilies.filter((t) => t.toFamilyId === family.id).map((t) => t.amount),
        ),
        paysToFamilies: sum(settlement.betweenFamilies.filter((t) => t.fromFamilyId === family.id).map((t) => t.amount)),
      };
    })
    .filter((flow) => flow.collectsFromFamily + flow.handsOutToFamily + flow.receivesFromFamilies + flow.paysToFamilies > 0);
}
