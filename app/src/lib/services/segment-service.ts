// Segment / travel-mode mutation service. Framework-agnostic — see
// trip-service.ts. Parsing + mode validation stays in the action layer.

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { days, places, segments, hotelBookings } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';
import { ServiceError } from './service-error';
import { resolveDayWrite, type SegmentMode } from './access';

async function upsertSegment(
  dayId: string,
  idx: number,
  mode: SegmentMode,
): Promise<void> {
  const existing = await db
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.dayId, dayId), eq(segments.idx, idx)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(segments)
      .set({ mode })
      .where(eq(segments.id, existing[0].id));
  } else {
    await db.insert(segments).values({ dayId, idx, mode, distance: '', time: '' });
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
): Promise<{ tripId: string }> {
  const row = await db
    .select({ tripId: hotelBookings.tripId })
    .from(hotelBookings)
    .where(eq(hotelBookings.id, hotelId))
    .limit(1);
  const r = row[0];
  if (!r) throw new ServiceError('not_found', 'Hotel not found');
  if (!canWrite(await getTripRole(r.tripId, userId))) {
    throw new ServiceError('forbidden', 'Forbidden');
  }

  const patch =
    leg === 'arrival' ? { arrivalMode: mode } : { departureMode: mode };
  await db.update(hotelBookings).set(patch).where(eq(hotelBookings.id, hotelId));
  await touchTrip(r.tripId);
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

// Set a day's default travel mode. A non-null mode hard-overwrites every
// segment in the day to that mode; `null` = mixed (leaves segments as-is).
export async function setDayDefaultMode(
  userId: string,
  dayId: string,
  mode: SegmentMode | null,
): Promise<{ tripId: string }> {
  const owned = await resolveDayWrite(userId, dayId);

  await db.update(days).set({ defaultMode: mode }).where(eq(days.id, dayId));

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
