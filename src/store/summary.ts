import { settleTrip } from '@/domain';

import type { StoredTrip } from './trips';

/** Everything a screen needs to describe where a trip stands, from the point of view of this phone's owner. */
export function summarizeTrip(trip: StoredTrip) {
  const settlement = settleTrip(trip);
  const me = trip.members.find((member) => member.id === trip.meId);
  const myFamily = trip.families.find((family) => family.id === me?.familyId);

  return {
    settlement,
    myFamily,
    myFamilyNet: myFamily ? (settlement.familyNets.get(myFamily.id) ?? 0) : 0,
    totalSpent: trip.expenses.reduce((sum, expense) => sum + expense.amount, 0),
  };
}

export type TripSummary = ReturnType<typeof summarizeTrip>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
