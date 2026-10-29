import { describe, expect, it } from 'vitest';
import type {
  CalendarEvent,
  ItineraryDay,
  ItineraryStop,
} from './calendar-queries';
import {
  buildTripRange,
  resolveCalendarView,
  tripRangeAvailable,
  tripRangeEnd,
} from './calendar-trip-range';

function ev(
  bookingId: string,
  date: string,
  label: string,
  time: string | null = null,
  type: CalendarEvent['type'] = 'hotel',
): CalendarEvent {
  return {
    id: `${bookingId}:${date}`,
    date,
    type,
    label,
    color: '#000',
    href: `/b/${bookingId}`,
    time,
  };
}

function day(idx: number, date: string, title = `Day ${idx + 1}`): ItineraryDay {
  return { idx, date, title, placeCount: 0 };
}

function stop(dayIdx: number, n: number): ItineraryStop {
  return { dayIdx, id: `p${dayIdx}-${n}`, name: `Stop ${n}`, time: null, kind: 'sight' };
}

const TRIP = { tripStart: '2026-04-12', tripEnd: '2026-04-16' };

describe('resolveCalendarView', () => {
  it('opens on the trip when dated and short', () => {
    expect(resolveCalendarView(TRIP)).toBe('trip');
  });

  it('an old ?ym= link opens the month grid', () => {
    expect(resolveCalendarView({ ...TRIP, ym: '2026-05' })).toBe('month');
  });

  it('an explicit view beats ym', () => {
    expect(resolveCalendarView({ ...TRIP, view: 'trip', ym: '2026-05' })).toBe('trip');
    expect(resolveCalendarView({ ...TRIP, view: 'month' })).toBe('month');
  });

  it('no start date means month, even when trip is asked for', () => {
    expect(resolveCalendarView({ tripStart: null, tripEnd: '2026-04-16' })).toBe('month');
    expect(
      resolveCalendarView({ tripStart: null, tripEnd: '2026-04-16', view: 'trip' }),
    ).toBe('month');
  });

  it('a 40-day trip opens on the month grid', () => {
    const long = { tripStart: '2026-01-01', tripEnd: '2026-02-09' };
    expect(resolveCalendarView(long)).toBe('month');
    expect(resolveCalendarView({ ...long, view: 'trip' })).toBe('month');
  });

  it('a 31-day trip still gets the trip view', () => {
    expect(resolveCalendarView({ tripStart: '2026-01-01', tripEnd: '2026-01-31' })).toBe(
      'trip',
    );
  });

  it('a bogus view falls through to the default rule', () => {
    expect(resolveCalendarView({ ...TRIP, view: 'bogus' })).toBe('trip');
    expect(resolveCalendarView({ ...TRIP, view: 'bogus', ym: '2026-05' })).toBe('month');
  });

  it('an end before the start means month', () => {
    expect(resolveCalendarView({ tripStart: '2026-04-12', tripEnd: '2026-04-10' })).toBe(
      'month',
    );
    expect(tripRangeAvailable('2026-04-12', '2026-04-10')).toBe(false);
  });
});

describe('tripRangeEnd', () => {
  it('uses the trip end date when set', () => {
    expect(tripRangeEnd('2026-04-16', [day(0, '2026-04-12')])).toBe('2026-04-16');
  });

  it('a start-only trip ends on its last itinerary day', () => {
    const end = tripRangeEnd(null, [day(0, '2026-11-05'), day(2, '2026-11-07')]);
    expect(end).toBe('2026-11-07');
    expect(resolveCalendarView({ tripStart: '2026-11-05', tripEnd: end })).toBe('trip');
  });

  it('no end and no days is null', () => {
    expect(tripRangeEnd(null, [])).toBeNull();
  });
});

describe('buildTripRange', () => {
  const base = { ...TRIP, events: [], itinerary: [], stops: [] };

  it('one column per trip day', () => {
    const { columns, outside } = buildTripRange(base);
    expect(columns.map((c) => c.iso)).toEqual([
      '2026-04-12',
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
    ]);
    expect(columns.every((c) => c.edge === null)).toBe(true);
    expect(outside).toEqual({ count: 0, firstIso: null });
  });

  it('edge column holds a booking one day before the trip', () => {
    const flight = ev('f1', '2026-04-11', 'JL5', '11:45', 'flight');
    const { columns } = buildTripRange({ ...base, events: [flight] });
    expect(columns.map((c) => c.iso)).toEqual([
      '2026-04-11',
      '2026-04-12',
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
    ]);
    expect(columns[0].edge).toBe('before');
    expect(columns[0].bookings).toEqual([flight]);
  });

  it('extends up to 3 days after the trip for a booking there', () => {
    const { columns } = buildTripRange({
      ...base,
      events: [ev('f2', '2026-04-19', 'Home')],
    });
    expect(columns.map((c) => c.iso).slice(-3)).toEqual([
      '2026-04-17',
      '2026-04-18',
      '2026-04-19',
    ]);
    expect(columns.at(-1)?.edge).toBe('after');
    expect(columns.at(-1)?.bookings).toHaveLength(1);
  });

  it('a booking further out adds no column and is counted', () => {
    const { columns, outside } = buildTripRange({
      ...base,
      events: [ev('h9', '2026-04-01', 'Far'), ev('h9', '2026-04-02', 'Far')],
    });
    expect(columns).toHaveLength(5);
    expect(outside).toEqual({ count: 1, firstIso: '2026-04-01' });
  });

  it('a booking with any night inside the columns is not counted outside', () => {
    const { outside } = buildTripRange({
      ...base,
      events: [ev('h1', '2026-04-16', 'Late'), ev('h1', '2026-04-25', 'Late')],
    });
    expect(outside.count).toBe(0);
  });

  it('orders bookings by time, untimed last', () => {
    const hotel = ev('h1', '2026-04-13', 'Hoshinoya', '15:00');
    const train = ev('t1', '2026-04-13', 'Shinkansen', '09:15', 'train');
    const night = ev('h2', '2026-04-13', 'Another hotel', null);
    const { columns } = buildTripRange({ ...base, events: [night, hotel, train] });
    expect(columns[1].bookings.map((b) => b.label)).toEqual([
      'Shinkansen',
      'Hoshinoya',
      'Another hotel',
    ]);
  });

  it('junk time sorts as untimed (part 2): untimed after timed, by label', () => {
    const { columns } = buildTripRange({
      ...base,
      events: [
        ev('b', '2026-04-12', 'Zeta'),
        ev('c', '2026-04-12', 'Alpha'),
        ev('a', '2026-04-12', 'Mid', '23:00'),
      ],
    });
    expect(columns[0].bookings.map((b) => b.label)).toEqual(['Mid', 'Alpha', 'Zeta']);
  });

  it('stops are capped at 8 with a remainder count', () => {
    const stops = Array.from({ length: 12 }, (_, i) => stop(0, i));
    const { columns } = buildTripRange({
      ...base,
      itinerary: [day(0, '2026-04-12')],
      stops,
    });
    expect(columns[0].stops).toHaveLength(8);
    expect(columns[0].stops.map((s) => s.name)).toEqual(
      stops.slice(0, 8).map((s) => s.name),
    );
    expect(columns[0].moreStops).toBe(4);
    expect(columns[1].stops).toHaveLength(0);
    expect(columns[1].moreStops).toBe(0);
  });

  it('itinerary days past the end date get columns, capped at 31 days', () => {
    const { columns } = buildTripRange({
      ...base,
      itinerary: [day(0, '2026-04-12'), day(6, '2026-04-18', 'Bonus')],
    });
    expect(columns.map((c) => c.iso).slice(-2)).toEqual(['2026-04-17', '2026-04-18']);
    expect(columns.at(-1)?.edge).toBe('after');
    expect(columns.at(-1)?.day?.title).toBe('Bonus');

    const far = buildTripRange({
      ...base,
      itinerary: [day(40, '2026-05-22')],
    });
    expect(far.columns.at(-1)?.iso).toBe('2026-04-16');
  });

  it('maps an itinerary day onto its date', () => {
    const { columns } = buildTripRange({
      ...base,
      itinerary: [day(0, '2026-04-12'), day(2, '2026-04-14', 'Kyoto')],
      stops: [stop(2, 0)],
    });
    expect(columns[2].iso).toBe('2026-04-14');
    expect(columns[2].day?.title).toBe('Kyoto');
    expect(columns[2].stops.map((s) => s.id)).toEqual(['p2-0']);
    expect(columns[1].day).toBeNull();
  });
});
