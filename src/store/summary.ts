import { settleTrip, type TripSettlement } from '@/domain';

import type { StoredTrip } from './trips';

/** Everything a screen needs to describe where a trip stands, from the point of view of this phone's owner. */
const nothingToSettle: TripSettlement = {
  memberNets: new Map(),
  familyNets: new Map(),
  betweenFamilies: [],
  withinFamily: new Map(),
};

export function summarizeTrip(trip: StoredTrip) {
  // A trip can arrive half-downloaded while another phone is still uploading it, for example a
  // family whose members have not come through yet. Show it without balances rather than crash.
  let settlement = nothingToSettle;
  let incomplete = false;
  try {
    settlement = settleTrip(trip);
  } catch {
    incomplete = true;
  }
  const me = trip.members.find((member) => member.id === trip.meId);
  const myFamily = trip.families.find((family) => family.id === me?.familyId);

  return {
    settlement,
    /** True when the trip's data does not add up yet, so no balances can be shown. */
    incomplete,
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
