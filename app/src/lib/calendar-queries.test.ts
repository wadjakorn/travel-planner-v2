import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  eventsFromBookings,
  expandSpan,
  hotelLastNight,
  parseLooseDate,
} from './calendar-queries';

describe('addDaysIso', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysIso('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('handles leap day', () => {
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('subtracts across a year boundary', () => {
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('expandSpan', () => {
  it('returns the single day when there is no end', () => {
    expect(expandSpan('2026-04-12', null)).toEqual(['2026-04-12']);
  });

  it('is inclusive of both ends', () => {
    expect(expandSpan('2026-04-12', '2026-04-14')).toEqual([
      '2026-04-12',
      '2026-04-13',
      '2026-04-14',
    ]);
  });

  it('collapses an end before the start rather than returning nothing', () => {
    expect(expandSpan('2026-04-12', '2026-04-10')).toEqual(['2026-04-12']);
  });

  it('caps a nonsensical span so one bad row cannot flood the calendar', () => {
    expect(expandSpan('2026-01-01', '2999-01-01')).toHaveLength(366);
  });
});

describe('hotelLastNight', () => {
  it('excludes the checkout date — 3 nights occupies 3 cells', () => {
    const last = hotelLastNight('2026-04-12', '2026-04-15', null);
    expect(last).toBe('2026-04-14');
    expect(expandSpan('2026-04-12', last)).toHaveLength(3);
  });

  it('falls back to nights when there is no checkout date', () => {
    expect(hotelLastNight('2026-04-12', null, 3)).toBe('2026-04-14');
  });

  it('prefers the checkout date over nights when both exist', () => {
    expect(hotelLastNight('2026-04-12', '2026-04-13', 9)).toBe('2026-04-12');
  });

  it('degrades to a single day for a same-day checkout', () => {
    expect(hotelLastNight('2026-04-12', '2026-04-12', null)).toBe('2026-04-12');
  });

  it('degrades to a single day with neither checkout nor nights', () => {
    expect(hotelLastNight('2026-04-12', null, null)).toBe('2026-04-12');
  });
});

describe('parseLooseDate', () => {
  it('passes an ISO date through', () => {
    expect(parseLooseDate('2026-04-12T10:00:00Z')).toBe('2026-04-12');
  });

  it('returns null for junk', () => {
    expect(parseLooseDate('not a date')).toBeNull();
  });
});

describe('eventsFromBookings', () => {
  const hotel = {
    id: 'h1',
    name: 'Hoshinoya',
    checkInDate: '2026-04-12',
    checkInTime: '3:00 PM',
    checkOutDate: '2026-04-14',
    nights: null,
  };

  it('hotel check-in time only on the first night', () => {
    const evts = eventsFromBookings([hotel], [], 't1');
    expect(evts.map((e) => [e.date, e.time])).toEqual([
      ['2026-04-12', '15:00'],
      ['2026-04-13', null],
    ]);
    expect(evts[0].id).toBe('h1:2026-04-12');
    expect(evts[0].href).toBe('/trip/t1/booking/hotel/h1/edit');
  });

  it('transport departure time sits on its from date', () => {
    const evts = eventsFromBookings(
      [],
      [
        {
          id: 'x1',
          type: 'train',
          title: 'Shinkansen · Tokyo → Kyoto',
          fromDate: '2026-04-14',
          fromTime: '09:15',
          toDate: null,
        },
      ],
      't1',
    );
    expect(evts).toHaveLength(1);
    expect(evts[0]).toMatchObject({
      date: '2026-04-14',
      time: '09:15',
      type: 'train',
      label: 'Shinkansen',
    });
  });

  it('junk time sorts as untimed (part 1): unreadable time is null', () => {
    const evts = eventsFromBookings(
      [{ ...hotel, checkInTime: 'morning', checkOutDate: null }],
      [],
      't1',
    );
    expect(evts).toHaveLength(1);
    expect(evts[0].time).toBeNull();
  });
});
