import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { days, hotelBookings, places, transportBookings } from '@/db/schema';

export type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'hotel' | 'flight' | 'train' | 'car' | 'ferry';
  label: string;
  color: string;
  href: string;
};

// One itinerary day, resolved onto a real calendar date. Rendered as a small
// line inside the cell rather than an event chip, so it never eats into the
// 3-chip budget that bookings compete for.
export type ItineraryDay = {
  date: string; // YYYY-MM-DD
  idx: number; // 0-based, matches days.idx
  title: string;
  placeCount: number;
};

const COLORS = {
  hotel: '#5b3fd9',
  flight: '#0071e3',
  train: '#29a847',
  car: '#ff9500',
  ferry: '#0099a8',
} as const;

// Bookings come from free-text date columns, so a typo can produce a span of
// arbitrary length. Cap it so one bad row cannot fill the calendar (and the
// events array) with thousands of chips.
const MAX_SPAN_DAYS = 366;

export function parseLooseDate(s: string | null): string | null {
  if (!s) return null;
  // ISO already?
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Add whole days to an ISO date in UTC — no local-timezone DST drift.
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// Inclusive list of ISO dates from `start` to `end`. `end` before `start`
// collapses to the single start day rather than producing nothing.
export function expandSpan(start: string, end: string | null): string[] {
  if (!end || end <= start) return [start];
  const out: string[] = [];
  for (let cur = start, i = 0; cur <= end && i < MAX_SPAN_DAYS; cur = addDaysIso(cur, 1), i++) {
    out.push(cur);
  }
  return out;
}

// Last night a hotel stay occupies. A 3-night stay checking out on the 4th
// shows on 3 cells — the checkout date is not a night in the room.
export function hotelLastNight(
  checkIn: string,
  checkOut: string | null,
  nights: number | null,
): string {
  if (checkOut) {
    const last = addDaysIso(checkOut, -1);
    return last >= checkIn ? last : checkIn;
  }
  if (nights && nights > 1) return addDaysIso(checkIn, nights - 1);
  return checkIn;
}

export async function loadCalendarEvents(
  tripId: string,
): Promise<CalendarEvent[]> {
  const [hotels, transport] = await Promise.all([
    db
      .select()
      .from(hotelBookings)
      .where(
        and(eq(hotelBookings.tripId, tripId), isNull(hotelBookings.deletedAt)),
      ),
    db
      .select()
      .from(transportBookings)
      .where(
        and(
          eq(transportBookings.tripId, tripId),
          isNull(transportBookings.deletedAt),
        ),
      ),
  ]);

  const events: CalendarEvent[] = [];
  for (const h of hotels) {
    const date = parseLooseDate(h.checkInDate);
    if (!date) continue;
    const last = hotelLastNight(date, parseLooseDate(h.checkOutDate), h.nights);
    const href = `/trip/${tripId}/booking/hotel/${h.id}/edit`;
    for (const d of expandSpan(date, last)) {
      events.push({
        id: `${h.id}:${d}`,
        date: d,
        type: 'hotel',
        label: h.name,
        color: COLORS.hotel,
        href,
      });
    }
  }
  for (const t of transport) {
    const date = parseLooseDate(t.fromDate);
    if (!date) continue;
    const type = t.type as 'flight' | 'train' | 'car' | 'ferry';
    const label = t.title.split(' · ')[0] ?? t.title;
    const color = COLORS[type] ?? '#888';
    const href = `/trip/${tripId}/booking/transport/${t.id}/edit`;
    for (const d of expandSpan(date, parseLooseDate(t.toDate))) {
      events.push({
        id: `${t.id}:${d}`,
        date: d,
        type,
        label,
        color,
        href,
      });
    }
  }
  return events;
}

// Itinerary days placed on the calendar.
//
// The real date is `trips.startDate + days.idx` — NEVER parse `days.date`,
// which is display text ("Day 1", "Saturday, April 12") with no year.
// `days.idx` is 0-based and removeDay() repacks it to stay contiguous, so the
// arithmetic holds. This is only correct while `trips.startDate` is immutable
// after day seeding: any action writing to `trips` must whitelist its columns
// and leave startDate alone, or the whole calendar shifts silently.
export async function loadItineraryDays(
  tripId: string,
  tripStartDate: string | null,
): Promise<ItineraryDay[]> {
  const start = parseLooseDate(tripStartDate);
  if (!start) return [];

  const rows = await db
    .select({
      idx: days.idx,
      title: days.title,
      placeCount: sql<number>`count(${places.id})`.mapWith(Number),
    })
    .from(days)
    // soft-delete filter lives in the JOIN, not the WHERE — a day whose places
    // are all deleted must still appear, with a count of 0.
    .leftJoin(places, and(eq(places.dayId, days.id), isNull(places.deletedAt)))
    .where(eq(days.tripId, tripId))
    .groupBy(days.id, days.idx, days.title)
    .orderBy(asc(days.idx));

  return rows.map((r) => ({
    date: addDaysIso(start, r.idx),
    idx: r.idx,
    title: r.title,
    placeCount: r.placeCount,
  }));
}
