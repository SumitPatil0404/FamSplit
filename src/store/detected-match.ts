import { settleTrip, type BankAlert, type Paise, type Transfer } from '@/domain';

import type { StoredTrip } from './trips';

/** A payment picked up from a bank or UPI alert. It stays on this phone and is never synced. */
export type DetectedPayment = BankAlert & {
  id: string;
  /** When the phone saw the alert. */
  seenAt: string;
  /** The alert as it arrived, so the user can check what was read. */
  text: string;
  /** The app the alert came from, e.g. "com.google.android.apps.messaging"; unset when pasted. */
  source?: string;
  status: 'new' | 'added' | 'dismissed';
  /** The trip it was added to, or PERSONAL. */
  tripId?: string;
  /** What adding it created: the trip expense, the settle-up payment or the personal expense, so it can be put back. */
  createdId?: string;
};

/** In place of a trip id: the bank payment became a personal expense. */
export const PERSONAL = 'personal';

/** A bank SMS and a UPI app usually both report the same payment within a minute or two. */
const SAME_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

/** The payment already in the list that `next` is a second alert for, if any. */
export function findDuplicate(existing: DetectedPayment[], next: BankAlert & { seenAt: string }): DetectedPayment | undefined {
  return existing.find((payment) => {
    if (payment.reference && next.reference) {
      return payment.reference === next.reference;
    }
    return (
      payment.direction === next.direction &&
      payment.amount === next.amount &&
      Math.abs(Date.parse(payment.seenAt) - Date.parse(next.seenAt)) <= SAME_PAYMENT_WINDOW_MS
    );
  });
}

export function isDuplicate(existing: DetectedPayment[], next: BankAlert & { seenAt: string }): boolean {
  return findDuplicate(existing, next) !== undefined;
}

/**
 * A UPI app's "You paid ₹300" and the bank's SMS for the same payment each know different things,
 * so the second fills in whatever the first left out.
 */
export function fillIn(payment: DetectedPayment, other: BankAlert): DetectedPayment {
  return {
    ...payment,
    party: payment.party ?? other.party,
    upiId: payment.upiId ?? other.upiId,
    date: payment.date ?? other.date,
    account: payment.account ?? other.account,
    reference: payment.reference ?? other.reference,
  };
}

/**
 * A readable name from the part of a UPI ID before the @: "swiggy@icici" gives "Swiggy" and
 * "rahul.sharma@okaxis" gives "Rahul Sharma". Words with digits in them, such as phone numbers and
 * shop QR codes ("paytmqr2810050501@paytm"), are left out, which can leave nothing.
 */
export function nameFromUpiId(upiId: string): string {
  return upiId
    .split('@')[0]
    .split(/[._-]+/)
    .filter((word) => /^[a-z]+$/i.test(word))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** The day an expense from this alert is dated: the day the bank gives, or the day it was seen. */
export function paidOn(payment: DetectedPayment): string {
  if (!payment.date) {
    return payment.seenAt;
  }
  const [year, month, day] = payment.date.split('-').map(Number);
  // Midday, so the day does not change in any time zone.
  return new Date(year, month - 1, day, 12).toISOString();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Open trips this payment could be added to, best fit first: trips whose expenses span its date
 * (a day either side), then the trip used most recently. Only trips where this phone has said who
 * it is, since the expense is paid by them.
 */
export function tripsFor(payment: DetectedPayment, trips: StoredTrip[]): StoredTrip[] {
  const when = Date.parse(paidOn(payment));
  const dates = (trip: StoredTrip) => trip.expenses.map((expense) => Date.parse(expense.date));
  const covers = (trip: StoredTrip) =>
    trip.expenses.length > 0 && when >= Math.min(...dates(trip)) - DAY_MS && when <= Math.max(...dates(trip)) + DAY_MS;
  const lastUsed = (trip: StoredTrip) => Math.max(Date.parse(trip.createdAt), ...dates(trip));
  return trips
    .filter((trip) => !trip.finalizedAt && trip.members.some((member) => member.id === trip.meId))
    .sort((a, b) => Number(covers(b)) - Number(covers(a)) || lastUsed(b) - lastUsed(a));
}

/** What each person still owes this phone's owner on a trip, by member id. */
export function owedToMe(trip: StoredTrip): Map<string, Paise> {
  const owed = new Map<string, Paise>();
  if (!trip.meId) {
    return owed;
  }
  try {
    const settlement = settleTrip(trip);
    for (const transfer of [...settlement.betweenFamilies, ...[...settlement.withinFamily.values()].flat()]) {
      if (transfer.toMemberId === trip.meId) {
        owed.set(transfer.fromMemberId, (owed.get(transfer.fromMemberId) ?? 0) + transfer.amount);
      }
    }
  } catch {
    // Still downloading; nothing is known to be owed yet.
  }
  return owed;
}

export type SettleUpMatch = {
  trip: StoredTrip;
  transfer: Transfer;
  /** The alert names the payer, or gives their UPI ID. */
  byName: boolean;
  /** The alert is for exactly what is owed. */
  byAmount: boolean;
};

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** "Rahul", "Rahul Sharma" and "RAHUL SHA" all name Rahul Sharma. */
function namesMatch(memberName: string, party: string): boolean {
  const member = words(memberName);
  const alert = words(party);
  if (member.length === 0 || alert.length === 0 || member[0] !== alert[0]) {
    return false;
  }
  // After the first name, each further word in the alert must start a word of the member's name.
  return alert.slice(1).every((word, index) => member[index + 1]?.startsWith(word) ?? true);
}

/**
 * The payments still owed to this phone's owner that a credit alert could be, best match first:
 * the right person for the right amount, then the right person, then the right amount.
 */
export function settleUpMatches(trips: StoredTrip[], payment: DetectedPayment): SettleUpMatch[] {
  if (payment.direction !== 'credit') {
    return [];
  }
  const matches: SettleUpMatch[] = [];
  for (const trip of trips) {
    if (!trip.meId) {
      continue;
    }
    let settlement;
    try {
      settlement = settleTrip(trip);
    } catch {
      // Still downloading; it has no balances yet.
      continue;
    }
    const owedToMe = [...settlement.betweenFamilies, ...[...settlement.withinFamily.values()].flat()].filter(
      (transfer) => transfer.toMemberId === trip.meId,
    );
    for (const transfer of owedToMe) {
      const from = trip.members.find((member) => member.id === transfer.fromMemberId);
      // A name match is the whole debt or part of it; more than they owe is probably something else.
      const byName =
        from !== undefined &&
        payment.amount <= transfer.amount &&
        ((payment.upiId !== undefined && from.upiId?.toLowerCase() === payment.upiId.toLowerCase()) ||
          (payment.party !== undefined && namesMatch(from.name, payment.party)));
      const byAmount = transfer.amount === payment.amount;
      if (byName || byAmount) {
        matches.push({ trip, transfer, byName, byAmount });
      }
    }
  }
  const rank = (match: SettleUpMatch) => (match.byName ? 2 : 0) + (match.byAmount ? 1 : 0);
  return matches.sort((a, b) => rank(b) - rank(a));
}
