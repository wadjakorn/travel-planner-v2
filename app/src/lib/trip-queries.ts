// Trip-detail read paths used by server components.
//
// Phase 2A: simple owner-only fetch. Phase 8 layers in trip_membership
// + role checks for editor/viewer access.

import { cache } from 'react';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  trips,
  days,
  places,
  segments,
  hotelBookings,
  transportBookings,
} from '@/db/schema';
import type {
  Trip,
  Day,
  Place,
  Segment,
  HotelBooking,
  TransportBooking,
} from '@/db/schema';
import { seedTripDays, expectedDayCount } from '@/lib/seed-days';

export type LoadedDay = Day & {
  places: Place[];
  segments: Segment[];
};

export type LoadedTrip = Trip & {
  days: LoadedDay[];
};

export type TripSummary = Trip & {
  daysCount: number;
  placesCount: number;
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

export async function loadTripsForOwner(
  ownerId: string,
): Promise<TripSummary[]> {
  const tripRows = await db
    .select()
    .from(trips)
    .where(and(eq(trips.ownerId, ownerId), isNull(trips.deletedAt)))
    .orderBy(desc(trips.createdAt));

  if (tripRows.length === 0) return [];

  const tripIds = tripRows.map((t) => t.id);

  const [dayCounts, placeCounts] = await Promise.all([
    db
      .select({ tripId: days.tripId, c: count() })
      .from(days)
      .where(inArray(days.tripId, tripIds))
      .groupBy(days.tripId),
    db
      .select({ tripId: days.tripId, c: count() })
      .from(places)
      .innerJoin(days, eq(places.dayId, days.id))
      .where(
        and(inArray(days.tripId, tripIds), isNull(places.deletedAt)),
      )
      .groupBy(days.tripId),
  ]);

  const dByTrip = new Map(dayCounts.map((r) => [r.tripId, r.c]));
  const pByTrip = new Map(placeCounts.map((r) => [r.tripId, r.c]));

  return tripRows.map((t) => ({
    ...t,
    daysCount: dByTrip.get(t.id) ?? 0,
    placesCount: pByTrip.get(t.id) ?? 0,
  }));
}

// Trip header row only — used by the shared trip layout to render
// Header + TripRail without paying for full days/places/segments fetch.
export const loadTripBasic = cache(async function loadTripBasic(
  tripId: string,
): Promise<Trip | null> {
  const r = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), isNull(trips.deletedAt)),
  });
  return r ?? null;
});

// Booking counts for the rail badges. Single round-trip per call.
export const loadBookingCounts = cache(async function loadBookingCounts(
  tripId: string,
): Promise<{ hotels: number; transport: number }> {
  const [hRow, tRow] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(hotelBookings)
      .where(
        and(eq(hotelBookings.tripId, tripId), isNull(hotelBookings.deletedAt)),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(transportBookings)
      .where(
        and(
          eq(transportBookings.tripId, tripId),
          isNull(transportBookings.deletedAt),
        ),
      ),
  ]);
  return { hotels: hRow[0]?.n ?? 0, transport: tRow[0]?.n ?? 0 };
});

export const loadTrip = cache(async function loadTrip(
  tripId: string,
): Promise<LoadedTrip | null> {
  const tripRow = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), isNull(trips.deletedAt)),
  });
  if (!tripRow) return null;

  let dayRows = await db
    .select()
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(asc(days.idx));

  // Lazy backfill: if trip has a date range, ensure one day row per date.
  // Append missing tail days starting after the existing max idx.
  if (tripRow.startDate && tripRow.endDate) {
    const expected = expectedDayCount(tripRow.startDate, tripRow.endDate);
    if (dayRows.length < expected) {
      const startIdx = dayRows.length;
      await seedTripDays(
        tripId,
        tripRow.startDate,
        tripRow.endDate,
        startIdx,
        startIdx,
      );
      dayRows = await db
        .select()
        .from(days)
        .where(eq(days.tripId, tripId))
        .orderBy(asc(days.idx));
    }
  }

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
});

// cache()-wrapped: the trip layout (persistent map) and the itinerary page
// both need the hotel rows within one request — dedupe to a single query.
export const loadHotelsForTrip = cache(async function loadHotelsForTrip(
  tripId: string,
): Promise<HotelBooking[]> {
  return db
    .select()
    .from(hotelBookings)
    .where(
      and(
        eq(hotelBookings.tripId, tripId),
        isNull(hotelBookings.deletedAt),
      ),
    )
    .orderBy(asc(hotelBookings.checkInDate));
});

export async function loadTransportForTrip(
  tripId: string,
): Promise<TransportBooking[]> {
  return db
    .select()
    .from(transportBookings)
    .where(
      and(
        eq(transportBookings.tripId, tripId),
        isNull(transportBookings.deletedAt),
      ),
    )
    .orderBy(asc(transportBookings.fromDate));
}
