// Pure merge/sort/gap helpers for the consolidated Bookings view.
// Server-safe: no server-only imports, no DB access. Unit-tested.

import type { HotelBooking, TransportBooking } from '@/db/schema';

// A single row in the Bookings list — a stay or a ride, tagged with its
// primary date (hotel check-in / transport departure) for sorting + grouping.
export type BookingItem =
  | { kind: 'stay'; date: string | null; hotel: HotelBooking }
  | { kind: 'ride'; date: string | null; transport: TransportBooking };

/** Sort key: primary date, then primary time — so a day reads in the order it
 *  is lived, a 10:30 departure above a 15:00 check-in rather than the reverse.
 *  A row with no time sorts after every timed row on the same date, and a row
 *  with no date after everything: '￿' is above every digit, which makes both
 *  rules fall out of one string comparison. */
function sortKey(date: string | null, time: string | null): string {
  return `${date ?? '￿'} ${time ?? '￿'}`;
}

/** Merge hotels + transport into one list sorted by primary date, then time.
 *  Undated items sort last; order among equal keys is stable (input order). */
export function mergeBookings(
  hotels: HotelBooking[],
  transport: TransportBooking[],
): BookingItem[] {
  const decorated = [
    ...hotels.map((h) => ({
      item: { kind: 'stay', date: h.checkInDate ?? null, hotel: h } as BookingItem,
      key: sortKey(h.checkInDate ?? null, h.checkInTime ?? null),
    })),
    ...transport.map((t) => ({
      item: { kind: 'ride', date: t.fromDate ?? null, transport: t } as BookingItem,
      key: sortKey(t.fromDate ?? null, t.fromTime ?? null),
    })),
  ];
  // Decorate-sort-undecorate to keep the sort stable across engines: tie-break
  // on original index so equal keys preserve input order.
  return decorated
    .map((d, idx) => ({ ...d, idx }))
    .sort((a, b) => {
      if (a.key !== b.key) return a.key < b.key ? -1 : 1;
      return a.idx - b.idx;
    })
    .map((x) => x.item);
}

/** The span the bookings actually cover: earliest start to latest END, where
 *  end means check-out for a stay and arrival for a ride. Taking the last
 *  START instead reports a five-night stay as a single day. Undated rows are
 *  ignored; returns null when nothing is dated. */
export function bookingsDateRange(
  items: BookingItem[],
): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const it of items) {
    const from = it.kind === 'stay' ? it.hotel.checkInDate : it.transport.fromDate;
    // A ride with no arrival date is a same-day hop; fall back to departure.
    const to =
      it.kind === 'stay'
        ? (it.hotel.checkOutDate ?? it.hotel.checkInDate)
        : (it.transport.toDate ?? it.transport.fromDate);
    if (from && (start === null || from < start)) start = from;
    if (to && (end === null || to > end)) end = to;
  }
  if (!start) return null;
  return { start, end: end && end > start ? end : start };
}

/** ISO date `days` after `iso` (UTC, timezone-safe). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Nights (by sleep date) with no accommodation booked, between the first
 *  check-in and last check-out. Half-open [checkIn, checkOut): you sleep on
 *  nights checkIn … checkOut-1, so a checkout day equal to the next check-in
 *  is NOT a gap. Hotels missing either date are ignored. */
export function gapNights(hotels: HotelBooking[]): string[] {
  const valid = hotels
    .filter((h) => h.checkInDate && h.checkOutDate && h.checkInDate < h.checkOutDate)
    .map((h) => ({ ci: h.checkInDate as string, co: h.checkOutDate as string }));
  if (valid.length < 2) return [];

  const covered = new Set<string>();
  for (const { ci, co } of valid) {
    for (let n = ci; n < co; n = addDaysIso(n, 1)) covered.add(n);
  }

  const minCi = valid.reduce((m, v) => (v.ci < m ? v.ci : m), valid[0].ci);
  const maxCo = valid.reduce((m, v) => (v.co > m ? v.co : m), valid[0].co);

  const gaps: string[] = [];
  for (let n = minCi; n < maxCo; n = addDaysIso(n, 1)) {
    if (!covered.has(n)) gaps.push(n);
  }
  return gaps;
}
