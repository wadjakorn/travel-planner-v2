// Trip-range calendar: which view opens, and the per-day columns it shows.
//
// Pure and DB-free (type-only import from calendar-queries) so it is unit
// tested without a DATABASE_URL. Date math is UTC on YYYY-MM-DD strings.

import type {
  CalendarEvent,
  ItineraryDay,
  ItineraryStop,
} from '@/lib/calendar-queries';
import { addDays } from '@/lib/ics';
import { parseLooseDate } from '@/lib/loose-date';

export const TRIP_RANGE_MAX_DAYS = 31;
export const TRIP_RANGE_EDGE_DAYS = 3;
export const TRIP_RANGE_STOP_CAP = 8;

export type CalendarViewKind = 'trip' | 'month';

export type TripRangeColumn = {
  iso: string;
  edge: 'before' | 'after' | null;
  day: ItineraryDay | null;
  bookings: CalendarEvent[];
  stops: ItineraryStop[];
  moreStops: number;
};

export type TripRangeOutside = { count: number; firstIso: string | null };

// A start-only trip still has real days (startDate + idx), so its last
// itinerary day stands in for the missing end date. `itinerary` is sorted by idx.
export function tripRangeEnd(
  tripEnd: string | null,
  itinerary: ItineraryDay[],
): string | null {
  return parseLooseDate(tripEnd) ?? itinerary.at(-1)?.date ?? null;
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function tripRangeAvailable(
  tripStart: string | null,
  tripEnd: string | null,
): boolean {
  if (!tripStart || !tripEnd || tripEnd < tripStart) return false;
  return dayNumber(tripEnd) - dayNumber(tripStart) + 1 <= TRIP_RANGE_MAX_DAYS;
}

// Precedence: an explicit valid `view` wins, then any valid `ym` means month
// (old links and the ‹ › arrows), then trip view whenever it is available.
export function resolveCalendarView(p: {
  view?: string;
  ym?: string;
  tripStart: string | null;
  tripEnd: string | null;
}): CalendarViewKind {
  const available = tripRangeAvailable(p.tripStart, p.tripEnd);
  if (p.view === 'month') return 'month';
  if (p.view === 'trip') return available ? 'trip' : 'month';
  if (p.ym && /^\d{4}-\d{2}$/.test(p.ym)) return 'month';
  return available ? 'trip' : 'month';
}

function bookingId(e: CalendarEvent): string {
  const i = e.id.indexOf(':');
  return i === -1 ? e.id : e.id.slice(0, i);
}

// Timed first by time, then untimed by label. Ties break on label so the order
// is stable across renders.
function compareBookings(a: CalendarEvent, b: CalendarEvent): number {
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  return a.label.localeCompare(b.label);
}

export function buildTripRange(i: {
  tripStart: string;
  tripEnd: string;
  events: CalendarEvent[];
  itinerary: ItineraryDay[];
  stops: ItineraryStop[];
}): { columns: TripRangeColumn[]; outside: TripRangeOutside } {
  const { tripStart, tripEnd } = i;

  // Widen the range only as far as a booking needs, never past the edge cap.
  // A flight the evening before day 1 must not vanish from the view.
  let first = tripStart;
  let last = tripEnd < tripStart ? tripStart : tripEnd;
  const earliest = addDays(tripStart, -TRIP_RANGE_EDGE_DAYS);
  const latest = addDays(last, TRIP_RANGE_EDGE_DAYS);
  for (const e of i.events) {
    if (e.date < first && e.date >= earliest) first = e.date;
    if (e.date > last && e.date <= latest) last = e.date;
  }

  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of i.events) {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }
  const dayByDate = new Map(i.itinerary.map((d) => [d.date, d]));
  const stopsByDay = new Map<number, ItineraryStop[]>();
  for (const s of i.stops) {
    const arr = stopsByDay.get(s.dayIdx) ?? [];
    arr.push(s);
    stopsByDay.set(s.dayIdx, arr);
  }

  const columns: TripRangeColumn[] = [];
  // Bounded by the 31-day rule plus both edges; the guard only protects
  // against a caller that skipped resolveCalendarView.
  const maxColumns = TRIP_RANGE_MAX_DAYS + 2 * TRIP_RANGE_EDGE_DAYS;
  for (let iso = first; iso <= last && columns.length < maxColumns; iso = addDays(iso, 1)) {
    const day = dayByDate.get(iso) ?? null;
    const dayStops = day ? (stopsByDay.get(day.idx) ?? []) : [];
    columns.push({
      iso,
      edge: iso < tripStart ? 'before' : iso > tripEnd ? 'after' : null,
      day,
      bookings: [...(byDate.get(iso) ?? [])].sort(compareBookings),
      stops: dayStops.slice(0, TRIP_RANGE_STOP_CAP),
      moreStops: Math.max(0, dayStops.length - TRIP_RANGE_STOP_CAP),
    });
  }

  const shown = new Set(columns.map((c) => c.iso));
  const inside = new Set<string>();
  for (const e of i.events) if (shown.has(e.date)) inside.add(bookingId(e));
  const outsideIds = new Set<string>();
  let firstIso: string | null = null;
  for (const e of i.events) {
    const id = bookingId(e);
    if (inside.has(id)) continue;
    outsideIds.add(id);
    if (firstIso === null || e.date < firstIso) firstIso = e.date;
  }

  return { columns, outside: { count: outsideIds.size, firstIso } };
}
