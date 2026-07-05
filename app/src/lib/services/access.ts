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
  if (!canWrite(await getTripRole(tripId, userId))) {
    throw new ServiceError('forbidden', 'Forbidden');
  }
}

export type AccessNeed = 'read' | 'write' | 'owner';

// Resolve trip access, distinguishing "exists but forbidden" (403) from
// "no such trip" (404) — a null role covers both, so probe existence.
export async function requireTripAccess(
  userId: string,
  tripId: string,
  need: AccessNeed,
): Promise<'owner' | 'editor' | 'viewer'> {
  const role = await getTripRole(tripId, userId);
  if (!role) {
    const exists = await loadTripBasic(tripId);
    if (exists) {
      throw new ServiceError('forbidden', 'You do not have access to this trip');
    }
    throw new ServiceError('not_found', 'Trip not found');
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
  if (!r || !canWrite(await getTripRole(r.tripId, userId))) {
    throw new ServiceError('forbidden', 'Forbidden');
  }
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
  if (!r || !canWrite(await getTripRole(r.tripId, userId))) {
    throw new ServiceError('forbidden', 'Forbidden');
  }
  return { tripId: r.tripId, dayId: r.dayId, idx: r.idx };
}
