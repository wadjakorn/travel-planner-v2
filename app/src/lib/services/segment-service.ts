// Segment / travel-mode mutation service. Framework-agnostic — see
// trip-service.ts. Parsing + mode validation stays in the action layer.

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { days, places, segments, hotelBookings } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { canWrite, getTripRoleWith } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';
import { ServiceError } from './service-error';
import { resolveDayWrite, type SegmentMode } from './access';
import type { IdemExecutor } from '@/lib/api/idempotency';

// Select-then-write on neon-http. A reorder/remove (TP-0150) can fill this
// row and commit between the SELECT and the INSERT, so the insert is
// conflict-safe: the user's mode wins (DO UPDATE) instead of failing 23505.
export async function upsertSegment(
  dayId: string,
  idx: number,
  mode: SegmentMode,
  exec: IdemExecutor = db,
): Promise<void> {
  const existing = await exec
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.dayId, dayId), eq(segments.idx, idx)))
    .limit(1);
  if (existing[0]) {
    await exec
      .update(segments)
      .set({ mode })
      .where(eq(segments.id, existing[0].id));
  } else {
    await exec
      .insert(segments)
      .values({ dayId, idx, mode, distance: '', time: '' })
      .onConflictDoUpdate({ target: [segments.dayId, segments.idx], set: { mode } });
  }
}

export async function setSegmentMode(
  userId: string,
  dayId: string,
  idx: number,
  mode: SegmentMode,
): Promise<{ tripId: string }> {
  const owned = await resolveDayWrite(userId, dayId);

  await upsertSegment(dayId, idx, mode);
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'update',
    entityType: 'segment',
    after: { dayId, idx, mode },
  });

  return { tripId: owned.tripId };
}

export async function setHotelLegMode(
  userId: string,
  hotelId: string,
  leg: 'arrival' | 'departure',
  mode: SegmentMode,
  exec: IdemExecutor = db,
): Promise<{ tripId: string }> {
  const row = await exec
    .select({ tripId: hotelBookings.tripId })
    .from(hotelBookings)
    .where(eq(hotelBookings.id, hotelId))
    .limit(1);
  const r = row[0];
  if (!r) throw new ServiceError('not_found', 'Hotel not found');
  if (!canWrite(await getTripRoleWith(r.tripId, userId, exec))) {
    throw new ServiceError('forbidden', 'Forbidden');
  }

  const patch =
    leg === 'arrival' ? { arrivalMode: mode } : { departureMode: mode };
  await exec.update(hotelBookings).set(patch).where(eq(hotelBookings.id, hotelId));
  await touchTrip(r.tripId, exec);
  await writeAudit({
    tripId: r.tripId,
    userId,
    action: 'update',
    entityType: 'hotel',
    entityId: hotelId,
    after: { leg, mode },
  });

  return { tripId: r.tripId };
}

/** `days` columns written by a default-mode change. A concrete mode also sets
 *  the start leg's mode (hard-overwrite); `null` = mixed leaves start_mode. */
export function dayDefaultModePatch(
  mode: SegmentMode | null,
): { defaultMode: SegmentMode | null; startMode?: SegmentMode } {
  return mode ? { defaultMode: mode, startMode: mode } : { defaultMode: null };
}

/** Set the day's own start leg (morning hotel → first stop) mode. */
export async function setDayStartMode(
  userId: string,
  dayId: string,
  mode: SegmentMode,
): Promise<{ tripId: string }> {
  const owned = await resolveDayWrite(userId, dayId);
  await db.update(days).set({ startMode: mode }).where(eq(days.id, dayId));
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'update',
    entityType: 'day',
    entityId: dayId,
    after: { startMode: mode },
  });
  return { tripId: owned.tripId };
}

// Set a day's default travel mode. A non-null mode hard-overwrites every
// segment in the day to that mode; `null` = mixed (leaves segments as-is).
export async function setDayDefaultMode(
  userId: string,
  dayId: string,
  mode: SegmentMode | null,
): Promise<{ tripId: string }> {
  const owned = await resolveDayWrite(userId, dayId);

  await db.update(days).set(dayDefaultModePatch(mode)).where(eq(days.id, dayId));

  let segCount = 0;
  if (mode) {
    const placesInDay = await db
      .select({ idx: places.idx })
      .from(places)
      .where(eq(places.dayId, dayId))
      .orderBy(asc(places.idx));
    segCount = Math.max(0, placesInDay.length - 1);
    for (let i = 0; i < segCount; i++) {
      await upsertSegment(dayId, i, mode);
    }
  }

  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'update',
    entityType: 'day',
    entityId: dayId,
    after: { defaultMode: mode, overwroteSegments: segCount },
  });

  return { tripId: owned.tripId };
}
