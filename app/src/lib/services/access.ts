// Shared write-authz resolvers for service functions. Mirror the null-return
// `ownsTrip`/`ownsDay`/`ownsPlace` helpers that used to live in the action
// files, but throw a typed ServiceError instead of returning null. Behavior
// parity: a missing-or-unwritable day/place surfaces as 'Forbidden', matching
// the old merged checks.

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { days, places } from '@/db/schema';
import { loadTripBasic } from '@/lib/trip-queries';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { ServiceError } from './service-error';

export type SegmentMode = 'drive' | 'walk' | 'transit';

export async function assertTripWrite(
  userId: string,
  tripId: string,
): Promise<void> {
  await requireTripAccess(userId, tripId, 'write');
}

export type AccessNeed = 'read' | 'write' | 'owner';

// Resolve trip access, distinguishing "exists but forbidden" (403) from
// "no such / soft-deleted trip" (404). `loadTripBasic` filters `deletedAt`,
// so a trashed trip is treated as gone — no lingering access to its children.
export async function requireTripAccess(
  userId: string,
  tripId: string,
  need: AccessNeed,
): Promise<'owner' | 'editor' | 'viewer'> {
  // Probe live-existence first: a soft-deleted trip must 404, not authorize.
  const trip = await loadTripBasic(tripId);
  if (!trip) throw new ServiceError('not_found', 'Trip not found');

  const role = await getTripRole(tripId, userId);
  if (!role) {
    throw new ServiceError('forbidden', 'You do not have access to this trip');
  }
  if (need === 'owner' && role !== 'owner') {
    throw new ServiceError('forbidden', 'Only the owner can do this');
  }
  if (need === 'write' && !canWrite(role)) {
    throw new ServiceError('forbidden', 'You do not have edit access');
  }
  return role;
}

// Resolve the trip a day belongs to and confirm the user can write it.
export async function resolveDayWrite(
  userId: string,
  dayId: string,
): Promise<{ tripId: string; defaultMode: SegmentMode | null }> {
  const row = await db
    .select({ tripId: days.tripId, defaultMode: days.defaultMode })
    .from(days)
    .where(eq(days.id, dayId))
    .limit(1);
  const r = row[0];
  if (!r) throw new ServiceError('forbidden', 'Forbidden');
  await requireTripAccess(userId, r.tripId, 'write');
  return { tripId: r.tripId, defaultMode: r.defaultMode };
}

// Resolve the trip + day + idx a place belongs to and confirm write access.
export async function resolvePlaceWrite(
  userId: string,
  placeId: string,
): Promise<{ tripId: string; dayId: string; idx: number }> {
  const row = await db
    .select({
      dayId: places.dayId,
      idx: places.idx,
      tripId: days.tripId,
    })
    .from(places)
    .innerJoin(days, eq(days.id, places.dayId))
    .where(eq(places.id, placeId))
    .limit(1);
  const r = row[0];
  if (!r) throw new ServiceError('forbidden', 'Forbidden');
  await requireTripAccess(userId, r.tripId, 'write');
  return { tripId: r.tripId, dayId: r.dayId, idx: r.idx };
}
