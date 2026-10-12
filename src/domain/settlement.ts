import { familyNets, memberNets } from './balances';
import type { FamilyTransfer, Paise, Transfer, Trip } from './types';

type Edge = { from: string; to: string; amount: Paise };

/**
 * Turns a set of net positions into at most n-1 payments by repeatedly matching
 * the biggest debtor with the biggest creditor. Ties break on id so the result
 * is the same on every device.
 */
function simplify(nets: Map<string, Paise>): Edge[] {
  const open = [...nets].filter(([, net]) => net !== 0).map(([id, net]) => ({ id, net }));
  const edges: Edge[] = [];

  while (open.length > 1) {
    open.sort((a, b) => a.net - b.net || a.id.localeCompare(b.id));
    const debtor = open[0];
    const creditor = open[open.length - 1];
    const amount = Math.min(-debtor.net, creditor.net);
    if (amount <= 0) {
      break;
    }
    edges.push({ from: debtor.id, to: creditor.id, amount });
    debtor.net += amount;
    creditor.net -= amount;
    for (let i = open.length - 1; i >= 0; i--) {
      if (open[i].net === 0) {
        open.splice(i, 1);
      }
    }
  }
  return edges;
}

/** The final settlement: payments between family heads only. */
export function settleBetweenFamilies(trip: Trip, nets = memberNets(trip)): FamilyTransfer[] {
  const headOf = new Map(trip.families.map((family) => [family.id, family.headId]));
  return simplify(familyNets(trip, nets)).map((edge) => ({
    fromFamilyId: edge.from,
    toFamilyId: edge.to,
    fromMemberId: headOf.get(edge.from)!,
    toMemberId: headOf.get(edge.to)!,
    amount: edge.amount,
  }));
}

/**
 * A family's internal settlement: every other member squares up with the head,
 * which leaves the head carrying exactly the family's net position.
 */
export function settleWithinFamily(trip: Trip, familyId: string, nets = memberNets(trip)): Transfer[] {
  const family = trip.families.find((candidate) => candidate.id === familyId);
  if (!family) {
    throw new Error(`Unknown family "${familyId}"`);
  }

  const transfers: Transfer[] = [];
  for (const member of trip.members) {
    const net = nets.get(member.id) ?? 0;
    if (member.familyId !== familyId || member.id === family.headId || net === 0) {
      continue;
    }
    transfers.push(
      net < 0
        ? { fromMemberId: member.id, toMemberId: family.headId, amount: -net }
        : { fromMemberId: family.headId, toMemberId: member.id, amount: net },
    );
  }
  return transfers;
}

export type TripSettlement = {
  memberNets: Map<string, Paise>;
  familyNets: Map<string, Paise>;
  betweenFamilies: FamilyTransfer[];
  withinFamily: Map<string, Transfer[]>;
};

export function settleTrip(trip: Trip): TripSettlement {
  const nets = memberNets(trip);
  return {
    memberNets: nets,
    familyNets: familyNets(trip, nets),
    betweenFamilies: settleBetweenFamilies(trip, nets),
    withinFamily: new Map(trip.families.map((family) => [family.id, settleWithinFamily(trip, family.id, nets)])),
  };
}
