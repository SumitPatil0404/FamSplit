/**
 * "families": several families, heads settle first, then each family inside.
 * "friends": everyone settles with everyone. Each person is kept as a family of one, so the
 * settlement and the server tables work the same; only the screens differ.
 */
export type TripKind = 'families' | 'friends';

/** Trips made before friends trips existed have no kind and are family trips. */
export function isFriendsTrip(trip: { kind?: TripKind }): boolean {
  return trip.kind === 'friends';
}
