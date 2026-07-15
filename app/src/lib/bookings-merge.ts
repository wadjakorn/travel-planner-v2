// Pure merge/sort/gap helpers for the consolidated Bookings view.
// Server-safe: no server-only imports, no DB access. Unit-tested.

import type { HotelBooking, TransportBooking } from '@/db/schema';

// A single row in the Bookings list — a stay or a ride, tagged with its
// primary date (hotel check-in / transport departure) for sorting + grouping.
export type BookingItem =
  | { kind: 'stay'; date: string | null; hotel: HotelBooking }
  | { kind: 'ride'; date: string | null; transport: TransportBooking };

/** Merge hotels + transport into one list sorted by primary date ascending.
 *  Undated items sort last; order among equal keys is stable (input order). */
export function mergeBookings(
  hotels: HotelBooking[],
  transport: TransportBooking[],
): BookingItem[] {
  const items: BookingItem[] = [
    ...hotels.map((h): BookingItem => ({ kind: 'stay', date: h.checkInDate ?? null, hotel: h })),
    ...transport.map((t): BookingItem => ({ kind: 'ride', date: t.fromDate ?? null, transport: t })),
  ];
  // Decorate-sort-undecorate to keep the sort stable across engines: tie-break
  // on original index so equal / both-null dates preserve input order.
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const ak = a.item.date ?? '￿'; // nulls sort last (ISO dates are < ￿)
      const bk = b.item.date ?? '￿';
      if (ak !== bk) return ak < bk ? -1 : 1;
      return a.idx - b.idx;
    })
    .map((x) => x.item);
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
