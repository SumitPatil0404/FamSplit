import { settleTrip, type TripSettlement } from '@/domain';

import { englishT, msg, type T } from '@/i18n/translate';

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

const MONTHS = [msg('Jan'), msg('Feb'), msg('Mar'), msg('Apr'), msg('May'), msg('Jun'), msg('Jul'), msg('Aug'), msg('Sep'), msg('Oct'), msg('Nov'), msg('Dec')];

/** Full month names, for the calendar and month headings. */
export const MONTH_NAMES = [
  msg('January'),
  msg('February'),
  msg('March'),
  msg('April'),
  msg('May'),
  msg('June'),
  msg('July'),
  msg('August'),
  msg('September'),
  msg('October'),
  msg('November'),
  msg('December'),
];

export function formatDay(iso: string, t: T = englishT): string {
  const date = new Date(iso);
  return `${date.getDate()} ${t(MONTHS[date.getMonth()])}`;
}

/** "Today", "Yesterday" or "18 Oct". */
export function relativeDay(iso: string, t: T = englishT): string {
  const day = new Date(iso).toDateString();
  const today = new Date();
  if (day === today.toDateString()) {
    return t('Today');
  }
  today.setDate(today.getDate() - 1);
  return day === today.toDateString() ? t('Yesterday') : formatDay(iso, t);
}
