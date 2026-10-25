import { useSyncExternalStore } from 'react';

import { expenseShares, toPaise, type Paise, type Split } from '@/domain';
import { englishT, plural, type T } from '@/i18n/translate';

import { CATEGORIES, guessCategory, type Category } from './categories';
import { paidOn, type DetectedPayment } from './detected-match';
import type { StoredExpense, StoredTrip } from './trips';

export type SplitMode = 'equal' | 'perFamily' | 'shares' | 'exact';

/** payerId when more than one person paid. */
export const SEVERAL = 'several';

/**
 * The expense being added or edited. It lives outside any one screen because choosing the
 * category, who paid and how it is split each happen on a page of their own.
 */
export type ExpenseDraft = {
  tripId: string;
  expenseId?: string;
  amountText: string;
  description: string;
  /** When it was paid; today for a new expense. */
  date: string;
  /** Unset until someone picks one; until then the category follows the description. */
  categoryId?: string;
  payerId: string;
  paidTexts: Record<string, string>;
  mode: SplitMode;
  memberOn: Record<string, boolean>;
  familyOn: Record<string, boolean>;
  shares: Record<string, number>;
  exactTexts: Record<string, string>;
  /** The bank payment this expense was started from, marked as added once it is saved. */
  alertId?: string;
};

let draft: ExpenseDraft | null = null;
const listeners = new Set<() => void>();

function set(next: ExpenseDraft | null, notify = true) {
  draft = next;
  if (notify) {
    listeners.forEach((listener) => listener());
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getDraft = () => draft;

export function useDraft(): ExpenseDraft | null {
  return useSyncExternalStore(subscribe, getDraft, getDraft);
}

export function updateDraft(patch: Partial<ExpenseDraft>) {
  if (draft) {
    set({ ...draft, ...patch });
  }
}

function toTexts(amounts: Record<string, Paise>): Record<string, string> {
  return Object.fromEntries(Object.entries(amounts).map(([memberId, value]) => [memberId, String(value / 100)]));
}

/**
 * A fresh draft for a new expense, one filled in from an expense being edited, or one filled in from
 * a bank payment. While a page is rendering it must not notify other components, so it passes
 * `notify: false`.
 */
export function startDraft(trip: StoredTrip, existing?: StoredExpense, notify = true, payment?: DetectedPayment) {
  const payers = existing ? Object.keys(existing.paidBy).filter((id) => existing.paidBy[id] > 0) : [];
  const split = existing?.split;
  set({
    tripId: trip.id,
    expenseId: existing?.id,
    alertId: existing ? undefined : payment?.id,
    amountText: existing ? String(existing.amount / 100) : payment ? String(payment.amount / 100) : '',
    date: existing?.date ?? (payment ? paidOn(payment) : new Date().toISOString()),
    description: existing?.description ?? payment?.party ?? '',
    categoryId: existing?.category,
    payerId: existing ? (payers.length > 1 ? SEVERAL : payers[0]) : trip.meId || (trip.members[0]?.id ?? ''),
    paidTexts: existing && payers.length > 1 ? toTexts(existing.paidBy) : {},
    mode: split?.type ?? 'equal',
    memberOn: Object.fromEntries(
      trip.members.map((member) => [member.id, split?.type === 'equal' ? split.memberIds.includes(member.id) : true]),
    ),
    familyOn: Object.fromEntries(
      trip.families.map((family) => [family.id, split?.type === 'perFamily' ? split.familyIds.includes(family.id) : true]),
    ),
    shares: Object.fromEntries(
      trip.members.map((member) => [member.id, split?.type === 'shares' ? (split.shares[member.id] ?? 0) : 1]),
    ),
    exactTexts: split?.type === 'exact' ? toTexts(split.amounts) : {},
  }, notify);
}

/** Keeps only digits and a single decimal point with up to two decimals. */
export function cleanAmount(text: string): string {
  const [whole, ...rest] = text.replace(/[^0-9.]/g, '').split('.');
  return rest.length > 0 ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

export function parseAmount(text: string | undefined): Paise {
  const trimmed = (text ?? '').replace(/\.$/, '');
  if (trimmed === '') {
    return 0;
  }
  try {
    return toPaise(trimmed.startsWith('.') ? `0${trimmed}` : trimmed);
  } catch {
    return 0;
  }
}

/** Turns typed amounts into paise, leaving out anyone with nothing entered. */
export function parseAmounts(texts: Record<string, string>): Record<string, Paise> {
  return Object.fromEntries(
    Object.entries(texts)
      .map(([memberId, text]) => [memberId, parseAmount(text)] as const)
      .filter(([, value]) => value > 0),
  );
}

export function sum(amounts: Record<string, Paise>): Paise {
  return Object.values(amounts).reduce((total, value) => total + value, 0);
}

/** Everything the screens need to know about a draft, worked out in one place. */
export function readDraft(draft: ExpenseDraft, trip: StoredTrip, t: T = englishT) {
  const amount = parseAmount(draft.amountText);
  const category: Category =
    CATEGORIES.find((candidate) => candidate.id === draft.categoryId) ?? guessCategory(draft.description);
  const several = draft.payerId === SEVERAL;
  const paidBy: Record<string, Paise> = several ? parseAmounts(draft.paidTexts) : { [draft.payerId]: amount };
  const exactAmounts = parseAmounts(draft.exactTexts);

  const split: Split =
    draft.mode === 'equal'
      ? { type: 'equal', memberIds: trip.members.filter((member) => draft.memberOn[member.id]).map((member) => member.id) }
      : draft.mode === 'perFamily'
        ? { type: 'perFamily', familyIds: trip.families.filter((family) => draft.familyOn[family.id]).map((family) => family.id) }
        : draft.mode === 'shares'
          ? {
              type: 'shares',
              shares: Object.fromEntries(
                trip.members
                  .filter((member) => draft.shares[member.id] > 0)
                  .map((member) => [member.id, draft.shares[member.id]]),
              ),
            }
          : { type: 'exact', amounts: exactAmounts };

  let preview: Map<string, Paise> | null = null;
  if (amount > 0) {
    try {
      preview = expenseShares({ id: 'draft', description: 'draft', amount, paidBy: {}, split }, trip);
    } catch {
      preview = null;
    }
  }

  const payerProblem = several && sum(paidBy) !== amount ? t('What each person paid must add up to the total') : null;
  const splitProblem =
    draft.mode === 'exact' && sum(exactAmounts) !== amount
      ? t('What each person owes must add up to the total')
      : amount > 0 && preview === null
        ? t('Choose who to split it between')
        : null;
  const problem = trip.finalizedAt
    ? t('This trip is finalised. Reopen it to change expenses.')
    : amount <= 0
      ? t('Enter how much was paid')
      : (payerProblem ?? splitProblem);

  return { amount, category, several, paidBy, exactAmounts, split, preview, payerProblem, splitProblem, problem };
}

/** "you", "Rajesh" or "2 people", for the "Paid by" button. */
export function payerLabel(draft: ExpenseDraft, trip: StoredTrip, paidBy: Record<string, Paise>, t: T = englishT): string {
  if (draft.payerId === SEVERAL) {
    const count = Object.keys(paidBy).length;
    return count > 1 ? t('{count} people', { count }) : t('several people');
  }
  if (draft.payerId === trip.meId) {
    return t('you');
  }
  return trip.members.find((member) => member.id === draft.payerId)?.name ?? t('choose');
}

/** "equally", "per family", "by shares"…, for the "split" button. */
export function splitLabel(draft: ExpenseDraft, trip: StoredTrip, t: T = englishT): string {
  switch (draft.mode) {
    case 'equal': {
      const count = trip.members.filter((member) => draft.memberOn[member.id]).length;
      return count === trip.members.length
        ? t('equally')
        : plural(t, count, 'between {count} person', 'between {count} people');
    }
    case 'perFamily': {
      const count = trip.families.filter((family) => draft.familyOn[family.id]).length;
      return count === trip.families.length
        ? t('per family')
        : plural(t, count, 'between {count} family', 'between {count} families');
    }
    case 'shares':
      return t('by shares');
    case 'exact':
      return t('by exact amounts');
  }
}
