import type { Paise } from './types';

/** Parses user input such as "1,234.5" into paise without going through floating point. */
export function toPaise(input: string): Paise {
  const cleaned = input.replace(/[,\s₹]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    throw new Error(`Invalid amount: "${input}"`);
  }
  const rupees = Number(match[1]);
  const paise = Number((match[2] ?? '').padEnd(2, '0'));
  return rupees * 100 + paise;
}

/** Formats paise with Indian digit grouping, e.g. 12345650 -> "₹1,23,456.50". */
export function formatPaise(amount: Paise, symbol = '₹'): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const rupees = String(Math.floor(abs / 100));
  const paise = abs % 100;

  const lastThree = rupees.slice(-3);
  const rest = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${lastThree}` : lastThree;
  const decimals = paise === 0 ? '' : `.${String(paise).padStart(2, '0')}`;

  return `${sign}${symbol}${grouped}${decimals}`;
}

/**
 * Divides `amount` in proportion to `weights` so the parts are whole paise and
 * add up exactly. Leftover paise go to the largest remainders, earliest first.
 */
export function allocate(amount: Paise, weights: number[]): Paise[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (weights.length === 0 || total <= 0 || weights.some((weight) => weight < 0)) {
    throw new Error('Cannot allocate: weights must be non-negative and not all zero');
  }

  const exact = weights.map((weight) => (amount * weight) / total);
  const parts = exact.map(Math.floor);
  const order = exact
    .map((value, index) => ({ index, remainder: value - parts[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  let leftover = amount - parts.reduce((sum, part) => sum + part, 0);
  for (let i = 0; leftover > 0; i++, leftover--) {
    parts[order[i % order.length].index] += 1;
  }
  return parts;
}
