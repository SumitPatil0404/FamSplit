import { allocate } from './money';
import type { Expense, Paise, Trip } from './types';

function isAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function assertUnique(ids: string[], what: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${what} are listed more than once`);
  }
}

/** What each person owes for one expense. Always adds up to the expense amount. */
export function expenseShares(expense: Expense, trip: Trip): Map<string, Paise> {
  const { amount, split } = expense;
  const fail = (reason: string): never => {
    throw new Error(`Expense "${expense.description}": ${reason}`);
  };
  if (!isAmount(amount)) {
    fail('amount must be a positive whole number of paise');
  }

  const shares = new Map<string, Paise>();
  const assign = (ids: string[], weights: number[], total: Paise) => {
    if (ids.length === 0) {
      fail('nobody to split between');
    }
    allocate(total, weights).forEach((part, i) => shares.set(ids[i], part));
  };

  switch (split.type) {
    case 'equal':
      assertUnique(split.memberIds, `Expense "${expense.description}": members`);
      assign(split.memberIds, split.memberIds.map(() => 1), amount);
      break;

    case 'shares': {
      const ids = Object.keys(split.shares);
      const weights = ids.map((id) => split.shares[id]);
      if (weights.some((weight) => !(weight >= 0)) || sum(weights) <= 0) {
        fail('shares must be zero or more, with at least one above zero');
      }
      assign(ids, weights, amount);
      break;
    }

    case 'exact': {
      const ids = Object.keys(split.amounts);
      const amounts = ids.map((id) => split.amounts[id]);
      if (amounts.some((value) => !Number.isSafeInteger(value) || value < 0)) {
        fail('exact amounts must be whole paise, zero or more');
      }
      if (sum(amounts) !== amount) {
        fail(`exact amounts add up to ${sum(amounts)}, not ${amount}`);
      }
      ids.forEach((id) => shares.set(id, split.amounts[id]));
      break;
    }

    case 'perFamily': {
      assertUnique(split.familyIds, `Expense "${expense.description}": families`);
      if (split.familyIds.length === 0) {
        fail('nobody to split between');
      }
      const familyParts = allocate(amount, split.familyIds.map(() => 1));
      split.familyIds.forEach((familyId, i) => {
        const ids = trip.members.filter((member) => member.familyId === familyId).map((member) => member.id);
        if (ids.length === 0) {
          fail(`family "${familyId}" has no members`);
        }
        assign(ids, ids.map(() => 1), familyParts[i]);
      });
      break;
    }
  }

  return shares;
}

function assertValidTrip(trip: Trip): void {
  assertUnique(trip.families.map((family) => family.id), 'Family ids');
  assertUnique(trip.members.map((member) => member.id), 'Member ids');

  const familyIds = new Set(trip.families.map((family) => family.id));
  const familyOf = new Map(trip.members.map((member) => [member.id, member.familyId]));
  for (const member of trip.members) {
    if (!familyIds.has(member.familyId)) {
      throw new Error(`Member "${member.name}" belongs to unknown family "${member.familyId}"`);
    }
  }
  for (const family of trip.families) {
    if (familyOf.get(family.headId) !== family.id) {
      throw new Error(`Head of family "${family.name}" must be one of its members`);
    }
  }
}

/**
 * Net position of every member: positive means the group owes them,
 * negative means they owe the group. Always adds up to zero.
 */
export function memberNets(trip: Trip): Map<string, Paise> {
  assertValidTrip(trip);

  const nets = new Map<string, Paise>(trip.members.map((member) => [member.id, 0]));
  const add = (memberId: string, delta: Paise, context: string) => {
    const current = nets.get(memberId);
    if (current === undefined) {
      throw new Error(`${context}: unknown member "${memberId}"`);
    }
    nets.set(memberId, current + delta);
  };

  for (const expense of trip.expenses) {
    const context = `Expense "${expense.description}"`;
    const paid = Object.entries(expense.paidBy);
    if (paid.some(([, value]) => !Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${context}: paid amounts must be whole paise, zero or more`);
    }
    if (sum(paid.map(([, value]) => value)) !== expense.amount) {
      throw new Error(`${context}: paid amounts do not add up to ${expense.amount}`);
    }
    const shares = expenseShares(expense, trip);
    paid.forEach(([memberId, value]) => add(memberId, value, context));
    shares.forEach((share, memberId) => add(memberId, -share, context));
  }

  for (const payment of trip.payments) {
    if (!isAmount(payment.amount)) {
      throw new Error('Payment amount must be a positive whole number of paise');
    }
    if (payment.fromMemberId === payment.toMemberId) {
      throw new Error('Payment must be between two different members');
    }
    add(payment.fromMemberId, payment.amount, 'Payment');
    add(payment.toMemberId, -payment.amount, 'Payment');
  }

  return nets;
}

/** Net position of every family: the sum of its members' nets. Always adds up to zero. */
export function familyNets(trip: Trip, nets = memberNets(trip)): Map<string, Paise> {
  const totals = new Map<string, Paise>(trip.families.map((family) => [family.id, 0]));
  for (const member of trip.members) {
    totals.set(member.familyId, (totals.get(member.familyId) ?? 0) + (nets.get(member.id) ?? 0));
  }
  return totals;
}
