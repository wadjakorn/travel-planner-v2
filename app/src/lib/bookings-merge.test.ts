import { describe, it, expect } from 'vitest';
import type { HotelBooking, TransportBooking } from '@/db/schema';
import { mergeBookings, gapNights } from './bookings-merge';

// Minimal factories — only the fields the pure helpers read. Cast through
// unknown to avoid restating every notNull column.
function hotel(p: { id: string; checkInDate?: string | null; checkOutDate?: string | null }): HotelBooking {
  return {
    id: p.id,
    name: `Hotel ${p.id}`,
    checkInDate: p.checkInDate ?? null,
    checkOutDate: p.checkOutDate ?? null,
  } as unknown as HotelBooking;
}
function ride(p: { id: string; fromDate?: string | null }): TransportBooking {
  return {
    id: p.id,
    type: 'flight',
    title: `Ride ${p.id}`,
    fromDate: p.fromDate ?? null,
  } as unknown as TransportBooking;
}

describe('mergeBookings', () => {
  it('merges stays + rides sorted by date ascending', () => {
    const items = mergeBookings(
      [hotel({ id: 'h1', checkInDate: '2026-07-14', checkOutDate: '2026-07-16' })],
      [
        ride({ id: 't1', fromDate: '2026-07-12' }),
        ride({ id: 't2', fromDate: '2026-07-15' }),
      ],
    );
    expect(items.map((i) => (i.kind === 'stay' ? i.hotel.id : i.transport.id))).toEqual([
      't1', // 07-12
      'h1', // 07-14
      't2', // 07-15
    ]);
    expect(items.map((i) => i.kind)).toEqual(['ride', 'stay', 'ride']);
  });

  it('tags each item with kind + primary date', () => {
    const [stay] = mergeBookings([hotel({ id: 'h1', checkInDate: '2026-07-14', checkOutDate: '2026-07-16' })], []);
    expect(stay).toMatchObject({ kind: 'stay', date: '2026-07-14' });
    const [r] = mergeBookings([], [ride({ id: 't1', fromDate: '2026-07-12' })]);
    expect(r).toMatchObject({ kind: 'ride', date: '2026-07-12' });
  });

  it('sorts null dates last, preserving input order among them (stable)', () => {
    const items = mergeBookings(
      [hotel({ id: 'hNull', checkInDate: null })],
      [
        ride({ id: 'tNull1', fromDate: null }),
        ride({ id: 't1', fromDate: '2026-07-12' }),
        ride({ id: 'tNull2', fromDate: null }),
      ],
    );
    const ids = items.map((i) => (i.kind === 'stay' ? i.hotel.id : i.transport.id));
    expect(ids[0]).toBe('t1'); // dated first
    expect(ids.slice(1)).toEqual(['hNull', 'tNull1', 'tNull2']); // nulls last, original order
  });

  it('returns [] for empty inputs', () => {
    expect(mergeBookings([], [])).toEqual([]);
  });
});

describe('gapNights', () => {
  it('returns nights between stays that have no accommodation', () => {
    // Stay A: 07-12 → 07-14 (sleeps nights 12,13). Stay B: 07-16 → 07-17
    // (sleeps night 16). Nights 14 and 15 are uncovered.
    const gaps = gapNights([
      hotel({ id: 'a', checkInDate: '2026-07-12', checkOutDate: '2026-07-14' }),
      hotel({ id: 'b', checkInDate: '2026-07-16', checkOutDate: '2026-07-17' }),
    ]);
    expect(gaps).toEqual(['2026-07-14', '2026-07-15']);
  });

  it('treats checkout day == next check-in as no gap (half-open)', () => {
    const gaps = gapNights([
      hotel({ id: 'a', checkInDate: '2026-07-12', checkOutDate: '2026-07-15' }),
      hotel({ id: 'b', checkInDate: '2026-07-15', checkOutDate: '2026-07-16' }),
    ]);
    expect(gaps).toEqual([]);
  });

  it('returns [] for a single stay and for empty input', () => {
    expect(gapNights([hotel({ id: 'a', checkInDate: '2026-07-12', checkOutDate: '2026-07-15' })])).toEqual([]);
    expect(gapNights([])).toEqual([]);
  });

  it('ignores hotels missing dates', () => {
    const gaps = gapNights([
      hotel({ id: 'a', checkInDate: '2026-07-12', checkOutDate: '2026-07-14' }),
      hotel({ id: 'x', checkInDate: null, checkOutDate: null }),
      hotel({ id: 'b', checkInDate: '2026-07-15', checkOutDate: '2026-07-16' }),
    ]);
    expect(gaps).toEqual(['2026-07-14']); // only the 14th uncovered
  });
});
