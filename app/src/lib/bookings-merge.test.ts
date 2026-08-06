import { describe, it, expect } from 'vitest';
import type { HotelBooking, TransportBooking } from '@/db/schema';
import { mergeBookings, gapNights, bookingsDateRange } from './bookings-merge';

// Minimal factories — only the fields the pure helpers read. Cast through
// unknown to avoid restating every notNull column.
function hotel(p: {
  id: string;
  checkInDate?: string | null;
  checkInTime?: string | null;
  checkOutDate?: string | null;
}): HotelBooking {
  return {
    id: p.id,
    name: `Hotel ${p.id}`,
    checkInDate: p.checkInDate ?? null,
    checkInTime: p.checkInTime ?? null,
    checkOutDate: p.checkOutDate ?? null,
  } as unknown as HotelBooking;
}
function ride(p: {
  id: string;
  fromDate?: string | null;
  fromTime?: string | null;
  toDate?: string | null;
}): TransportBooking {
  return {
    id: p.id,
    type: 'flight',
    title: `Ride ${p.id}`,
    fromDate: p.fromDate ?? null,
    fromTime: p.fromTime ?? null,
    toDate: p.toDate ?? null,
  } as unknown as TransportBooking;
}

function ids(items: ReturnType<typeof mergeBookings>) {
  return items.map((i) => (i.kind === 'stay' ? i.hotel.id : i.transport.id));
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

  it('orders same-day rows by time, across stays and rides', () => {
    // The reported case: a 15:00 check-in must not outrank a 10:30 departure.
    const items = mergeBookings(
      [hotel({ id: 'stay15', checkInDate: '2026-10-02', checkInTime: '15:00', checkOutDate: '2026-10-07' })],
      [
        ride({ id: 'ride19', fromDate: '2026-10-02', fromTime: '19:00' }),
        ride({ id: 'ride1030', fromDate: '2026-10-02', fromTime: '10:30' }),
      ],
    );
    expect(ids(items)).toEqual(['ride1030', 'stay15', 'ride19']);
  });

  it('sorts a row with no time after every timed row on the same date', () => {
    const items = mergeBookings(
      [hotel({ id: 'noTime', checkInDate: '2026-10-02', checkInTime: null })],
      [ride({ id: 'late', fromDate: '2026-10-02', fromTime: '23:45' })],
    );
    expect(ids(items)).toEqual(['late', 'noTime']);
  });

  it('keeps an earlier date ahead regardless of time of day', () => {
    const items = mergeBookings(
      [hotel({ id: 'day2', checkInDate: '2026-10-03', checkInTime: '00:05' })],
      [ride({ id: 'day1', fromDate: '2026-10-02', fromTime: '23:45' })],
    );
    expect(ids(items)).toEqual(['day1', 'day2']);
  });

  it('returns [] for empty inputs', () => {
    expect(mergeBookings([], [])).toEqual([]);
  });
});

describe('bookingsDateRange', () => {
  it('ends at the last check-out, not the last check-in', () => {
    // The reported case: one stay 10-02 → 10-07 plus same-day rides rendered
    // as "Oct 2–Oct 2" when only start dates were considered.
    const items = mergeBookings(
      [hotel({ id: 'h', checkInDate: '2026-10-02', checkOutDate: '2026-10-07' })],
      [ride({ id: 't', fromDate: '2026-10-02' })],
    );
    expect(bookingsDateRange(items)).toEqual({ start: '2026-10-02', end: '2026-10-07' });
  });

  it('uses a ride arrival date when it is the latest', () => {
    const items = mergeBookings([], [ride({ id: 't', fromDate: '2026-10-02', toDate: '2026-10-03' })]);
    expect(bookingsDateRange(items)).toEqual({ start: '2026-10-02', end: '2026-10-03' });
  });

  it('collapses to a single day when nothing runs longer', () => {
    const items = mergeBookings([], [ride({ id: 't', fromDate: '2026-10-02' })]);
    expect(bookingsDateRange(items)).toEqual({ start: '2026-10-02', end: '2026-10-02' });
  });

  it('ignores undated rows and returns null when none are dated', () => {
    const dated = mergeBookings(
      [hotel({ id: 'h', checkInDate: '2026-10-02', checkOutDate: '2026-10-04' })],
      [ride({ id: 'tNull', fromDate: null })],
    );
    expect(bookingsDateRange(dated)).toEqual({ start: '2026-10-02', end: '2026-10-04' });
    expect(bookingsDateRange(mergeBookings([], [ride({ id: 'x', fromDate: null })]))).toBeNull();
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

  it('measures against the trip, so ONE short stay still reports gaps', () => {
    // The reported case: trip Oct 2–6, one stay Oct 2 → Oct 3. You sleep on
    // nights 2,3,4,5 (the 6th is the day you fly home) and only the 2nd is
    // covered.
    const gaps = gapNights(
      [hotel({ id: 'a', checkInDate: '2026-10-02', checkOutDate: '2026-10-03' })],
      '2026-10-02',
      '2026-10-06',
    );
    expect(gaps).toEqual(['2026-10-03', '2026-10-04', '2026-10-05']);
  });

  it('reports nothing when the stay covers every night of the trip', () => {
    expect(
      gapNights(
        [hotel({ id: 'a', checkInDate: '2026-10-02', checkOutDate: '2026-10-06' })],
        '2026-10-02',
        '2026-10-06',
      ),
    ).toEqual([]);
  });

  it('stays silent with no usable hotel, however long the trip', () => {
    expect(gapNights([], '2026-10-02', '2026-10-06')).toEqual([]);
    // A hotel with no dates is not a booking anyone can sleep in, but it is
    // also not evidence that the trip is unbooked — still silent.
    expect(
      gapNights([hotel({ id: 'x', checkInDate: null, checkOutDate: null })], '2026-10-02', '2026-10-06'),
    ).toEqual([]);
  });

  it('falls back to the hotel span when the trip has no dates', () => {
    // Nothing to anchor to, so the only answerable question is "between the
    // bookings" — and a lone stay covers its own span.
    expect(gapNights([hotel({ id: 'a', checkInDate: '2026-07-12', checkOutDate: '2026-07-15' })])).toEqual([]);
    expect(
      gapNights([
        hotel({ id: 'a', checkInDate: '2026-07-12', checkOutDate: '2026-07-14' }),
        hotel({ id: 'b', checkInDate: '2026-07-15', checkOutDate: '2026-07-16' }),
      ]),
    ).toEqual(['2026-07-14']);
  });

  it('ignores a trip range that is inverted or a single day', () => {
    const one = [hotel({ id: 'a', checkInDate: '2026-07-12', checkOutDate: '2026-07-14' })];
    // start >= end carries no nights; fall back rather than invent a window.
    expect(gapNights(one, '2026-07-14', '2026-07-12')).toEqual([]);
    expect(gapNights(one, '2026-07-12', '2026-07-12')).toEqual([]);
  });

  it('returns [] for empty input', () => {
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
