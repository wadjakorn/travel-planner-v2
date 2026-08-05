// Trip → .ics event list. DB reads live here; the RFC 5545 writing lives in
// `@/lib/ics` (pure, unit-tested).

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { days, hotelBookings, places, transportBookings, trips } from '@/db/schema';
import { parseLooseDate } from '@/lib/loose-date';
import { hotelLastNight } from '@/lib/calendar-queries';
import {
  addDays,
  buildIcs,
  icsStamp,
  parseLooseTime,
  type IcsEvent,
} from '@/lib/ics';

/**
 * Build every VEVENT for a trip.
 *
 * Itinerary dates are `trips.startDate + days.idx` — NEVER parse `days.date`,
 * which is display text ("Day 1", "Saturday, April 12") with no year. A trip
 * with no `startDate` therefore contributes no itinerary events; its bookings
 * still export, since those carry their own dates.
 */
export function tripEvents(input: {
  tripId: string;
  tripStart: string | null;
  days: { id: string; idx: number; title: string }[];
  places: { id: string; dayId: string; name: string; time: string | null; address: string | null }[];
  hotels: {
    id: string;
    name: string;
    address: string | null;
    checkInDate: string | null;
    checkInTime: string | null;
    checkOutDate: string | null;
    checkOutTime: string | null;
    nights: number | null;
  }[];
  transport: {
    id: string;
    title: string;
    fromName: string | null;
    fromDate: string | null;
    fromTime: string | null;
    toName: string | null;
    toDate: string | null;
    toTime: string | null;
  }[];
}): IcsEvent[] {
  const events: IcsEvent[] = [];
  const start = parseLooseDate(input.tripStart);
  const dayDate = new Map<string, string>();

  if (start) {
    for (const d of input.days) {
      const date = addDays(start, d.idx);
      dayDate.set(d.id, date);
      events.push({
        kind: 'all-day',
        uid: `day-${d.id}@travel-planner-v2`,
        summary: `Day ${d.idx + 1} — ${d.title}`,
        start: date,
      });
    }
    for (const p of input.places) {
      const date = dayDate.get(p.dayId);
      if (!date) continue;
      // `places.time` is free text ("9:00 AM", "morning"). Unreadable → all-day
      // rather than an invented clock time.
      const time = parseLooseTime(p.time);
      events.push(
        time
          ? {
              kind: 'timed',
              uid: `place-${p.id}@travel-planner-v2`,
              summary: p.name,
              location: p.address,
              start: date,
              startTime: time,
            }
          : {
              kind: 'all-day',
              uid: `place-${p.id}@travel-planner-v2`,
              summary: p.name,
              location: p.address,
              start: date,
            },
      );
    }
  }

  for (const h of input.hotels) {
    const checkIn = parseLooseDate(h.checkInDate);
    if (!checkIn) continue;
    const checkOut = parseLooseDate(h.checkOutDate);
    const inTime = parseLooseTime(h.checkInTime);
    const outTime = parseLooseTime(h.checkOutTime);
    const uid = `hotel-${h.id}@travel-planner-v2`;
    if (inTime && checkOut) {
      events.push({
        kind: 'timed',
        uid,
        summary: h.name,
        location: h.address,
        start: checkIn,
        startTime: inTime,
        end: checkOut,
        endTime: outTime ?? '11:00',
      });
    } else {
      // All-day span over the nights actually spent in the room — the checkout
      // date is not a night, so `hotelLastNight` steps back one day.
      events.push({
        kind: 'all-day',
        uid,
        summary: h.name,
        location: h.address,
        start: checkIn,
        lastDay: hotelLastNight(checkIn, checkOut, h.nights),
      });
    }
  }

  for (const t of input.transport) {
    const from = parseLooseDate(t.fromDate);
    if (!from) continue;
    const to = parseLooseDate(t.toDate);
    const fromTime = parseLooseTime(t.fromTime);
    const toTime = parseLooseTime(t.toTime);
    const uid = `transport-${t.id}@travel-planner-v2`;
    const location = t.fromName ?? undefined;
    if (fromTime) {
      events.push({
        kind: 'timed',
        uid,
        summary: t.title,
        location,
        start: from,
        startTime: fromTime,
        end: to ?? from,
        endTime: toTime ?? undefined,
      });
    } else {
      events.push({
        kind: 'all-day',
        uid,
        summary: t.title,
        location,
        start: from,
        lastDay: to,
      });
    }
  }

  return events;
}

export async function exportTripIcs(
  tripId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const [trip] = await db
    .select({ id: trips.id, title: trips.title, startDate: trips.startDate })
    .from(trips)
    .where(and(eq(trips.id, tripId), isNull(trips.deletedAt)))
    .limit(1);
  if (!trip) return null;

  const [dayRows, hotels, transport] = await Promise.all([
    db
      .select({ id: days.id, idx: days.idx, title: days.title })
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.idx)),
    db
      .select()
      .from(hotelBookings)
      .where(and(eq(hotelBookings.tripId, tripId), isNull(hotelBookings.deletedAt))),
    db
      .select()
      .from(transportBookings)
      .where(
        and(eq(transportBookings.tripId, tripId), isNull(transportBookings.deletedAt)),
      ),
  ]);

  const dayIds = dayRows.map((d) => d.id);
  const placeRows = dayIds.length
    ? await db
        .select({
          id: places.id,
          dayId: places.dayId,
          name: places.name,
          time: places.time,
          address: places.address,
        })
        .from(places)
        .where(and(inArray(places.dayId, dayIds), isNull(places.deletedAt)))
        .orderBy(asc(places.idx))
    : [];

  const events = tripEvents({
    tripId,
    tripStart: trip.startDate,
    days: dayRows,
    places: placeRows,
    hotels,
    transport,
  });

  return buildIcs(trip.title, events, icsStamp(now));
}
