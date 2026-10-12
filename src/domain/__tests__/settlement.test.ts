import { sampleTrip } from '@/data/sample-trip';

import { expenseShares, familyNets, memberNets } from '../balances';
import { settleBetweenFamilies, settleTrip, settleWithinFamily } from '../settlement';
import type { Expense, Payment, Transfer, Trip } from '../types';

const total = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

/** Two families: A (a1 is head, a2) and B (b1 is head, b2, b3). */
function smallTrip(expenses: Expense[] = [], payments: Payment[] = []): Trip {
  return {
    families: [
      { id: 'A', name: 'A', headId: 'a1' },
      { id: 'B', name: 'B', headId: 'b1' },
    ],
    members: [
      { id: 'a1', name: 'a1', familyId: 'A' },
      { id: 'a2', name: 'a2', familyId: 'A' },
      { id: 'b1', name: 'b1', familyId: 'B' },
      { id: 'b2', name: 'b2', familyId: 'B' },
      { id: 'b3', name: 'b3', familyId: 'B' },
    ],
    expenses,
    payments,
  };
}

const everyone = ['a1', 'a2', 'b1', 'b2', 'b3'];
const hotel: Expense = {
  id: 'e1',
  description: 'Hotel',
  amount: 6000,
  paidBy: { a1: 6000 },
  split: { type: 'equal', memberIds: everyone },
};
const cab: Expense = {
  id: 'e2',
  description: 'Cab',
  amount: 3000,
  paidBy: { b2: 3000 },
  split: { type: 'perFamily', familyIds: ['A', 'B'] },
};

function asPayments(transfers: Transfer[]): Payment[] {
  return transfers.map((transfer, i) => ({ id: `p${i}`, ...transfer }));
}

describe('expenseShares', () => {
  it('splits per family regardless of family size', () => {
    const shares = expenseShares(cab, smallTrip());
    expect(Object.fromEntries(shares)).toEqual({ a1: 750, a2: 750, b1: 500, b2: 500, b3: 500 });
  });

  it('splits by weighted shares', () => {
    const expense: Expense = {
      ...hotel,
      amount: 2500,
      paidBy: { a1: 2500 },
      split: { type: 'shares', shares: { a1: 1, a2: 1, b3: 0.5 } },
    };
    expect(Object.fromEntries(expenseShares(expense, smallTrip()))).toEqual({ a1: 1000, a2: 1000, b3: 500 });
  });

  it('keeps every paisa when the amount does not divide evenly', () => {
    const expense: Expense = { ...hotel, amount: 1001, paidBy: { a1: 1001 } };
    const shares = expenseShares(expense, smallTrip());
    expect(total(shares.values())).toBe(1001);
    expect(shares.get('a1')).toBe(201);
    expect(shares.get('b3')).toBe(200);
  });

  it('rejects exact splits that do not add up', () => {
    const expense: Expense = { ...hotel, split: { type: 'exact', amounts: { a1: 1000, b1: 4000 } } };
    expect(() => expenseShares(expense, smallTrip())).toThrow(/add up to 5000, not 6000/);
  });

  it('rejects a member listed twice', () => {
    const expense: Expense = { ...hotel, split: { type: 'equal', memberIds: ['a1', 'a1'] } };
    expect(() => expenseShares(expense, smallTrip())).toThrow(/more than once/);
  });
});

describe('memberNets and familyNets', () => {
  it('nets what each member paid against what they owe', () => {
    const nets = memberNets(smallTrip([hotel, cab]));
    expect(Object.fromEntries(nets)).toEqual({ a1: 4050, a2: -1950, b1: -1700, b2: 1300, b3: -1700 });
  });

  it('rolls members up into families', () => {
    expect(Object.fromEntries(familyNets(smallTrip([hotel, cab])))).toEqual({ A: 2100, B: -2100 });
  });

  it('handles several payers on one expense', () => {
    const expense: Expense = { ...hotel, paidBy: { a1: 4000, b3: 2000 } };
    const nets = memberNets(smallTrip([expense]));
    expect(nets.get('a1')).toBe(2800);
    expect(nets.get('b3')).toBe(800);
  });

  it('rejects bad data', () => {
    expect(() => memberNets(smallTrip([{ ...hotel, paidBy: { a1: 5000 } }]))).toThrow(/do not add up/);
    expect(() => memberNets(smallTrip([{ ...hotel, paidBy: { ghost: 6000 } }]))).toThrow(/unknown member "ghost"/);
    expect(() => memberNets(smallTrip([{ ...hotel, amount: 60.5, paidBy: { a1: 60.5 } }]))).toThrow();

    const wrongHead = smallTrip();
    wrongHead.families[0].headId = 'b1';
    expect(() => memberNets(wrongHead)).toThrow(/must be one of its members/);
  });
});

describe('settlement', () => {
  it('settles between family heads only', () => {
    expect(settleBetweenFamilies(smallTrip([hotel, cab]))).toEqual([
      { fromFamilyId: 'B', toFamilyId: 'A', fromMemberId: 'b1', toMemberId: 'a1', amount: 2100 },
    ]);
  });

  it('settles each family internally through its head', () => {
    const trip = smallTrip([hotel, cab]);
    expect(settleWithinFamily(trip, 'A')).toEqual([{ fromMemberId: 'a2', toMemberId: 'a1', amount: 1950 }]);
    expect(settleWithinFamily(trip, 'B')).toEqual([
      { fromMemberId: 'b1', toMemberId: 'b2', amount: 1300 },
      { fromMemberId: 'b3', toMemberId: 'b1', amount: 1700 },
    ]);
  });

  it('keeps the internal settlement unchanged once the heads have paid', () => {
    const trip = smallTrip([hotel, cab]);
    const before = settleWithinFamily(trip, 'B');
    const settled = smallTrip([hotel, cab], asPayments(settleBetweenFamilies(trip)));

    expect(settleBetweenFamilies(settled)).toEqual([]);
    expect(settleWithinFamily(settled, 'B')).toEqual(before);
  });

  it('accounts for a partial payment between heads', () => {
    const paid: Payment = { id: 'p1', fromMemberId: 'b1', toMemberId: 'a1', amount: 1000 };
    const [remaining] = settleBetweenFamilies(smallTrip([hotel, cab], [paid]));
    expect(remaining.amount).toBe(1100);
  });

  it('has nothing to settle on an empty trip', () => {
    const result = settleTrip(smallTrip());
    expect(result.betweenFamilies).toEqual([]);
    expect([...result.withinFamily.values()].flat()).toEqual([]);
  });
});

describe('invariants', () => {
  function expectFullySettled(trip: Trip) {
    const result = settleTrip(trip);
    expect(total(result.memberNets.values())).toBe(0);
    expect(total(result.familyNets.values())).toBe(0);
    expect(result.betweenFamilies.length).toBeLessThan(Math.max(trip.families.length, 1));

    const headIds = new Set(trip.families.map((family) => family.headId));
    for (const transfer of result.betweenFamilies) {
      expect(headIds.has(transfer.fromMemberId)).toBe(true);
      expect(headIds.has(transfer.toMemberId)).toBe(true);
      expect(transfer.amount).toBeGreaterThan(0);
    }

    const transfers = [...result.betweenFamilies, ...[...result.withinFamily.values()].flat()];
    const after = memberNets({ ...trip, payments: [...trip.payments, ...asPayments(transfers)] });
    expect([...after.values()].every((net) => net === 0)).toBe(true);
  }

  it('leaves everyone at zero for the sample trip', () => {
    expectFullySettled(sampleTrip);
  });

  it('leaves everyone at zero for random trips', () => {
    let seed = 20261012;
    const random = (max: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor((seed / 4294967296) * max);
    };

    for (let run = 0; run < 200; run++) {
      const families = Array.from({ length: 2 + random(5) }, (_, f) => ({ id: `f${f}`, name: `f${f}`, headId: `f${f}m0` }));
      const members = families.flatMap((family) =>
        Array.from({ length: 1 + random(5) }, (_, m) => ({ id: `${family.id}m${m}`, name: `${family.id}m${m}`, familyId: family.id })),
      );
      const pick = () => members[random(members.length)].id;
      const someMembers = () => {
        const chosen = members.filter(() => random(2) === 0).map((member) => member.id);
        return chosen.length > 0 ? chosen : [pick()];
      };

      const expenses: Expense[] = Array.from({ length: 1 + random(12) }, (_, e) => {
        const amount = 1 + random(5000000);
        const kind = random(3);
        return {
          id: `e${e}`,
          description: `e${e}`,
          amount,
          paidBy: { [pick()]: amount },
          split:
            kind === 0
              ? { type: 'equal', memberIds: someMembers() }
              : kind === 1
                ? { type: 'perFamily', familyIds: families.filter((_, f) => f === 0 || random(2) === 0).map((family) => family.id) }
                : { type: 'shares', shares: Object.fromEntries(someMembers().map((id) => [id, random(2) === 0 ? 1 : 0.5])) },
        };
      });

      expectFullySettled({ families, members, expenses, payments: [] });
    }
  });
});
