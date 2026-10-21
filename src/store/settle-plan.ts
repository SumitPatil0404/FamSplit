import type { Transfer, TripSettlement } from '@/domain';

import type { StoredFamily, StoredTrip } from './trips';

export type FamilyStep = {
  family: StoredFamily;
  /** Payments inside the family, between its members and its head. */
  transfers: Transfer[];
  /** Inside payments wait until the head has squared up with the other families. */
  locked: boolean;
};

/** Every family, with what is still to be paid inside it. */
export function familySteps(trip: StoredTrip, settlement: TripSettlement): FamilyStep[] {
  return trip.families.map((family) => ({
    family,
    transfers: settlement.withinFamily.get(family.id) ?? [],
    locked: (settlement.familyNets.get(family.id) ?? 0) !== 0,
  }));
}

/**
 * The payments between families that this phone's owner makes or receives, which only happens
 * when they are a head. Payments inside a family are on that family's own page.
 */
export function myTransfers(trip: StoredTrip, settlement: TripSettlement): Transfer[] {
  if (!trip.meId) {
    return [];
  }
  return settlement.betweenFamilies.filter(
    (transfer) => transfer.fromMemberId === trip.meId || transfer.toMemberId === trip.meId,
  );
}
