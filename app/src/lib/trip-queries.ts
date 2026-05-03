// Trip-detail read paths used by server components.
//
// Phase 2A: simple owner-only fetch. Phase 8 layers in trip_membership
// + role checks for editor/viewer access.

import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { trips, days, places, segments } from '@/db/schema';
import type { Trip, Day, Place, Segment } from '@/db/schema';

export type LoadedDay = Day & {
  places: Place[];
  segments: Segment[];
};

export type LoadedTrip = Trip & {
  days: LoadedDay[];
};

export async function loadFirstTripForOwner(
  ownerId: string,
): Promise<LoadedTrip | null> {
  const tripRow = await db.query.trips.findFirst({
    where: and(eq(trips.ownerId, ownerId), isNull(trips.deletedAt)),
    orderBy: [asc(trips.createdAt)],
  });
  if (!tripRow) return null;
  return loadTrip(tripRow.id);
}

export async function loadTrip(tripId: string): Promise<LoadedTrip | null> {
  const tripRow = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), isNull(trips.deletedAt)),
  });
  if (!tripRow) return null;

  const dayRows = await db
    .select()
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(asc(days.idx));

  const dayIds = dayRows.map((d) => d.id);
  if (dayIds.length === 0) return { ...tripRow, days: [] };

  // Drizzle inArray would be cleaner; using two parallel passes per day to
  // keep the query simple. Number of days per trip is bounded (~14).
  const [allPlaces, allSegments] = await Promise.all([
    db
      .select()
      .from(places)
      .where(and(isNull(places.deletedAt)))
      .orderBy(asc(places.idx)),
    db
      .select()
      .from(segments)
      .orderBy(asc(segments.idx)),
  ]);

  const dayId = (id: string) => id;
  const placesByDay = new Map<string, Place[]>();
  const segmentsByDay = new Map<string, Segment[]>();
  for (const p of allPlaces) {
    if (!dayIds.includes(p.dayId)) continue;
    const arr = placesByDay.get(p.dayId) ?? [];
    arr.push(p);
    placesByDay.set(dayId(p.dayId), arr);
  }
  for (const s of allSegments) {
    if (!dayIds.includes(s.dayId)) continue;
    const arr = segmentsByDay.get(s.dayId) ?? [];
    arr.push(s);
    segmentsByDay.set(dayId(s.dayId), arr);
  }

  return {
    ...tripRow,
    days: dayRows.map((d) => ({
      ...d,
      places: placesByDay.get(d.id) ?? [],
      segments: segmentsByDay.get(d.id) ?? [],
    })),
  };
}
