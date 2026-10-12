import { allocate, formatPaise, toPaise } from '../money';

describe('toPaise', () => {
  it('parses whole and decimal amounts', () => {
    expect(toPaise('250')).toBe(25000);
    expect(toPaise('1,234.5')).toBe(123450);
    expect(toPaise('₹ 0.07')).toBe(7);
  });

  it('avoids floating point drift', () => {
    expect(toPaise('1.15')).toBe(115);
    expect(toPaise('8.2')).toBe(820);
  });

  it('rejects anything that is not an amount', () => {
    expect(() => toPaise('')).toThrow();
    expect(() => toPaise('12.345')).toThrow();
    expect(() => toPaise('-5')).toThrow();
    expect(() => toPaise('abc')).toThrow();
  });
});

describe('formatPaise', () => {
  it('uses Indian digit grouping', () => {
    expect(formatPaise(0)).toBe('₹0');
    expect(formatPaise(99900)).toBe('₹999');
    expect(formatPaise(123456)).toBe('₹1,234.56');
    expect(formatPaise(12345650)).toBe('₹1,23,456.50');
    expect(formatPaise(1234567800)).toBe('₹1,23,45,678');
  });

  it('shows a sign for negative amounts', () => {
    expect(formatPaise(-50005)).toBe('-₹500.05');
  });
});

describe('allocate', () => {
  it('gives leftover paise to the earliest entries', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(200, [1, 1, 1])).toEqual([67, 67, 66]);
  });

  it('respects weights, including half shares', () => {
    expect(allocate(1000, [1, 1, 0.5])).toEqual([400, 400, 200]);
    expect(allocate(100, [1, 0.5])).toEqual([67, 33]);
    expect(allocate(500, [1, 0])).toEqual([500, 0]);
  });

  it('always adds up to the amount', () => {
    for (let amount = 1; amount <= 500; amount += 7) {
      for (let people = 1; people <= 9; people++) {
        const parts = allocate(amount, Array(people).fill(1));
        expect(parts.reduce((a, b) => a + b, 0)).toBe(amount);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rejects empty or zero weights', () => {
    expect(() => allocate(100, [])).toThrow();
    expect(() => allocate(100, [0, 0])).toThrow();
    expect(() => allocate(100, [1, -1, 1])).toThrow();
  });
});
