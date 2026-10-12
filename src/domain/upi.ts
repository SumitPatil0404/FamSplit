import type { Paise } from './types';

/** A standard UPI link: any UPI app on the phone opens with the payee, amount and note filled in. */
export function upiLink(upiId: string, payeeName: string, amount: Paise, note: string): string {
  const query = [
    ['pa', upiId],
    ['pn', payeeName],
    ['am', (amount / 100).toFixed(2)],
    ['cu', 'INR'],
    ['tn', note],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `upi://pay?${query}`;
}
