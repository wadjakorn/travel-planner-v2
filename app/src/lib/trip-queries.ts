// Trip-detail read paths used by server components.
//
// The trip list resolves owned + shared trips (trip_membership). Per-trip
// role checks for mutations live in lib/services/access.ts.

import { cache } from 'react';
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  trips,
  tripMemberships,
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
import type { IdemExecutor } from '@/lib/api/idempotency';
import type { TripRole } from '@/lib/trip-access';
import { seedTripDays, expectedDayCount } from '@/lib/seed-days';
import { mergeBookings, type BookingItem } from '@/lib/bookings-merge';

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
  // 'owner' when trips.owner_id matches, otherwise the trip_membership role.
  // The trips table has no `role` column, so this intersection is collision-free.
  role: TripRole;
};

// Owned trips *and* trips shared via trip_membership. One leftJoin rather than
// a UNION ALL: a user can hold both an owner row and a membership row for the
// same trip (acceptInviteAction skips that today, but nothing in the schema
// enforces it and older rows predate the branch) and a union would list it
// twice. uniqueIndex('trip_membership_unique') caps the join at one row per
// trip, so it cannot fan out.
export async function loadTripsForUser(
  userId: string,
  exec: IdemExecutor = db,
): Promise<TripSummary[]> {
  const joined = await exec
    .select({ trip: trips, memberRole: tripMemberships.role })
    .from(trips)
    .leftJoin(
      tripMemberships,
      and(
        eq(tripMemberships.tripId, trips.id),
        eq(tripMemberships.userId, userId),
      ),
    )
    .where(
      and(
        isNull(trips.deletedAt),
        or(eq(trips.ownerId, userId), eq(tripMemberships.userId, userId)),
      ),
    )
    .orderBy(desc(trips.createdAt));

  if (joined.length === 0) return [];

  const tripRows = joined.map((r) => r.trip);
  const roleByTrip = new Map<string, TripRole>(
    joined.map((r) => [
      r.trip.id,
      r.trip.ownerId === userId
        ? ('owner' as TripRole)
        : ((r.memberRole ?? 'viewer') as TripRole),
    ]),
  );

  const tripIds = tripRows.map((t) => t.id);

  const [dayCounts, placeCounts] = await Promise.all([
    exec
      .select({ tripId: days.tripId, c: count() })
      .from(days)
      .where(inArray(days.tripId, tripIds))
      .groupBy(days.tripId),
    exec
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
    role: roleByTrip.get(t.id) ?? 'viewer',
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

// API read-back (API-IMPORT): the full trip plus its hotels, for /api/v1
// responses. Kept separate from loadTrip so the web-facing loader's shape is
// untouched.
export async function loadApiTrip(tripId: string) {
  const trip = await loadTrip(tripId);
  if (!trip) return null;
  const hotels = await loadHotelsForTrip(tripId);
  return { ...trip, hotels };
}

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

// Consolidated Bookings view: hotels + transport merged into one date-sorted
// list. Composes the existing loaders (their shapes stay untouched) so the
// web-facing Bookings page and any future reader share one merge rule.
export async function loadBookingsForTrip(tripId: string): Promise<BookingItem[]> {
  const [hotels, transport] = await Promise.all([
    loadHotelsForTrip(tripId),
    loadTransportForTrip(tripId),
  ]);
  return mergeBookings(hotels, transport);
}
