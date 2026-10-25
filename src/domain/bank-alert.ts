import { toPaise } from './money';
import type { Paise } from './types';

/** A payment read out of a bank SMS or a UPI app's notification. */
export type BankAlert = {
  direction: 'debit' | 'credit';
  amount: Paise;
  /** Who the money went to or came from, as the message names them: "Zomato", "Rahul Sharma". */
  party?: string;
  /** The other side's UPI ID, when the message gives one instead of, or as well as, a name. */
  upiId?: string;
  /** The day it happened, as "2026-10-24", when the message says. */
  date?: string;
  /** The last digits of the account or card it went through, e.g. "1234". */
  account?: string;
  /** The UPI or bank reference number, which tells apart two alerts for the same payment. */
  reference?: string;
};

/** OTPs, offers, reminders, requests and failed payments: money that has not actually moved. */
const NOT_A_PAYMENT =
  /\b(otp|one[- ]time password|verification code|will be|is due|due on|due date|scheduled|requested|request|failed|declined|unsuccessful|reversed|up ?to|pre-?approved|loan offer|apply now)\b/i;

/** The first of these words decides the direction; "paid you" comes before "paid" so it wins. */
const DIRECTION =
  /\b(paid you|sent you|credited|received|deposited|refunded|debited|spent|paid|sent|withdrawn|transferred|purchase)\b/i;
const CREDIT_WORDS = new Set(['paid you', 'sent you', 'credited', 'received', 'deposited', 'refunded']);

const AMOUNT = /(?:\brs\.?|\binr|₹)\s*(\d[\d,]*(?:\.\d{1,2})?)/gi;
/** Some banks leave out the currency: "debited by 500.0". */
const BARE_AMOUNT = /\b(?:debited|credited)\s+(?:by|for|with)\s+(\d[\d,]*(?:\.\d{1,2})?)/i;
/** Text just before an amount that makes it the balance or a limit rather than the payment. */
const BALANCE_BEFORE = /(?:bal(?:ance)?|limit|avl|available)[\s:.-]*(?:is|of)?[\s:.-]*$/i;

const UPI_ID = /\b[a-z0-9][a-z0-9._-]*@[a-z][a-z0-9]+\b/i;
const ACCOUNT = /\b(?:a\/c|ac|acct|account|card)(?:\s*no\.?)?(?:\s*ending(?:\s*with)?)?\s*[*x]*(\d{3,6})\b/i;
const REFERENCE =
  /\b(?:ref(?:erence)?\.?\s*(?:no\.?|num(?:ber)?)?|refno|upi(?:\s*ref)?(?:\s*no\.?)?|utr|txn\s*id)[\s:.#-]*(\d{6,})/i;
/** Axis Bank: "UPI/P2M/123456789012/ZOMATO". */
const AXIS_UPI = /\bUPI\/P2[AM]\/(\d+)\/([^/]+?)(?=\s+(?:-|not\b)|\/|$)/i;

/** Where a name ends: the next part of the sentence, a bracket, or the end of a sentence. */
const NAME_END = String.raw`(?=\s+(?:on|refno|ref|upi|via|from|using|txn|avl|not|if|for|is|has|with)\b|\s*\(|[.;,](?:\s|$)|\s*$)`;
const PAID_TO = new RegExp(String.raw`\b(?:trf to|to|at|towards)\s+(?:vpa\s+)?(.+?)${NAME_END}`, 'gi');
const PAID_BY = new RegExp(String.raw`\b(?:from|by)\s+(?:vpa\s+)?(.+?)${NAME_END}`, 'gi');
const PAID_YOU = /^(.+?)\s+(?:paid|sent) you\b/i;
/** ICICI Bank: "debited for Rs 1200.00 on 24-Oct-26; ZOMATO credited." */
const ICICI_PAYEE = /;\s*([^;]+?)\s+credited\b/i;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATES: { pattern: RegExp; read: (match: RegExpExecArray) => [string, string, string] }[] = [
  { pattern: /\b(20\d{2})-(\d{2})-(\d{2})/, read: (m) => [m[1], m[2], m[3]] },
  { pattern: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/, read: (m) => [m[3], m[2], m[1]] },
  {
    pattern: /\b(\d{1,2})[- ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[- ,]*(\d{4}|\d{2})\b/i,
    read: (m) => [m[3], String(MONTHS.indexOf(m[2].toLowerCase()) + 1), m[1]],
  },
];

/**
 * Reads the amount, direction and other side out of a bank or UPI alert, or returns null when the
 * text is not a payment that has gone through. Everything here runs on the phone.
 */
export function parseBankAlert(text: string): BankAlert | null {
  const message = text.replace(/\s+/g, ' ').trim();
  if (NOT_A_PAYMENT.test(message)) {
    return null;
  }
  const word = DIRECTION.exec(message)?.[1].toLowerCase();
  const amount = findAmount(message);
  if (!word || !amount) {
    return null;
  }
  const direction = CREDIT_WORDS.has(word) ? 'credit' : 'debit';
  return {
    direction,
    amount,
    ...findParty(message, direction),
    date: findDate(message),
    account: ACCOUNT.exec(message)?.[1],
    reference: AXIS_UPI.exec(message)?.[1] ?? REFERENCE.exec(message)?.[1],
  };
}

function findAmount(message: string): Paise | null {
  for (const match of message.matchAll(AMOUNT)) {
    if (!BALANCE_BEFORE.test(message.slice(0, match.index))) {
      return toPaise(match[1]) || null;
    }
  }
  const bare = BARE_AMOUNT.exec(message);
  return bare ? toPaise(bare[1]) || null : null;
}

function findParty(message: string, direction: BankAlert['direction']): { party?: string; upiId?: string } {
  const candidates: string[] = [];
  const axis = AXIS_UPI.exec(message);
  if (axis) {
    candidates.push(axis[2]);
  }
  if (direction === 'credit') {
    const paidYou = PAID_YOU.exec(message);
    if (paidYou) {
      candidates.push(paidYou[1]);
    }
  }
  for (const match of message.matchAll(direction === 'debit' ? PAID_TO : PAID_BY)) {
    candidates.push(match[1]);
  }
  if (direction === 'debit') {
    const icici = ICICI_PAYEE.exec(message);
    if (icici) {
      candidates.push(icici[1]);
    }
  }

  const found = candidates.map((candidate) => candidate.trim()).find(isName);
  if (found && UPI_ID.exec(found)?.[0] === found) {
    return { upiId: found };
  }
  const upiId = UPI_ID.exec(message)?.[0];
  return { party: found && tidyName(found), upiId };
}

/** Leaves out amounts, phone numbers and the user's own account, which follow the same little words. */
function isName(candidate: string): boolean {
  return (
    candidate.length > 0 &&
    candidate.length <= 40 &&
    /[a-z]/i.test(candidate) &&
    !/^(?:\d|rs\.?\s*\d|inr\b|₹|\()/i.test(candidate) &&
    !/\b(?:a\/c|ac|acct|account|card|bank|your)\b/i.test(candidate)
  );
}

/** "ZOMATO" becomes "Zomato"; names already in mixed case are left as they are. */
function tidyName(name: string): string {
  const trimmed = name.replace(/[\s.,;:-]+$/, '');
  return /[a-z]/.test(trimmed) ? trimmed : trimmed.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function findDate(message: string): string | undefined {
  const found = DATES.map(({ pattern, read }) => {
    const match = pattern.exec(message);
    return match ? { index: match.index, parts: read(match) } : null;
  })
    .filter((entry) => entry !== null)
    .sort((a, b) => a.index - b.index);

  for (const { parts } of found) {
    const [yearText, monthText, dayText] = parts;
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (month >= 1 && month <= 12 && date.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return undefined;
}
