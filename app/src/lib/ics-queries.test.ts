import { describe, expect, it } from 'vitest';
import { daySummary, tripEvents } from './ics-queries';

const EMPTY = { tripStart: null, days: [], places: [], hotels: [], transport: [] };

describe('daySummary', () => {
  it('does not double the day number when the title is the seeded "Day N"', () => {
    expect(daySummary(0, 'Day 1')).toBe('Day 1');
    expect(daySummary(2, 'Day 3')).toBe('Day 3');
  });

  it('keeps a renamed title that still opens with its own day number', () => {
    expect(daySummary(0, 'Day 1: Arrival')).toBe('Day 1: Arrival');
  });

  it('prefixes a real title', () => {
    expect(daySummary(0, 'Arrival in Tokyo')).toBe('Day 1 — Arrival in Tokyo');
  });

  it('falls back to the day number when the title is blank', () => {
    expect(daySummary(1, '   ')).toBe('Day 2');
  });
});

describe('tripEvents — itinerary', () => {
  it('dates days from trips.startDate + idx, never days.date', () => {
    const events = tripEvents({
      ...EMPTY,
      tripStart: '2026-04-12',
      days: [
        { id: 'd0', idx: 0, title: 'Arrival in Tokyo' },
        { id: 'd2', idx: 2, title: 'Hakone' },
      ],
    });
    expect(events).toEqual([
      expect.objectContaining({ start: '2026-04-12', summary: 'Day 1 — Arrival in Tokyo' }),
      expect.objectContaining({ start: '2026-04-14', summary: 'Day 3 — Hakone' }),
    ]);
  });

  it('drops itinerary events when the trip has no startDate but keeps bookings', () => {
    const events = tripEvents({
      ...EMPTY,
      days: [{ id: 'd0', idx: 0, title: 'Day one' }],
      places: [{ id: 'p1', dayId: 'd0', name: 'Senso-ji', time: '9:00 AM', address: null }],
      transport: [
        {
          id: 'x1',
          title: 'NRT → HND',
          fromName: 'NRT',
          fromDate: '2026-04-12',
          fromTime: '09:05',
          toName: 'HND',
          toDate: '2026-04-12',
          toTime: '11:20',
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'timed', summary: 'NRT → HND' });
  });

  it('makes a place timed when its free-text time parses, all-day when it does not', () => {
    const events = tripEvents({
      ...EMPTY,
      tripStart: '2026-04-12',
      days: [{ id: 'd0', idx: 0, title: 'Day one' }],
      places: [
        { id: 'p1', dayId: 'd0', name: 'Senso-ji', time: '9:00 AM', address: 'Asakusa' },
        { id: 'p2', dayId: 'd0', name: 'Ramen', time: 'ตอนเย็น', address: null },
      ],
    });
    expect(events[1]).toMatchObject({ kind: 'timed', startTime: '09:00', start: '2026-04-12' });
    expect(events[2]).toMatchObject({ kind: 'all-day', start: '2026-04-12' });
  });
});

describe('tripEvents — hotels', () => {
  it('spans the nights slept, not the checkout day', () => {
    const [ev] = tripEvents({
      ...EMPTY,
      hotels: [
        {
          id: 'h1',
          name: 'Park Hotel',
          address: null,
          checkInDate: '2026-04-12',
          checkInTime: null,
          checkOutDate: '2026-04-15',
          checkOutTime: null,
          nights: 3,
        },
      ],
    });
    expect(ev).toMatchObject({ kind: 'all-day', start: '2026-04-12', lastDay: '2026-04-14' });
  });

  it('goes timed when both a check-in time and a checkout date exist', () => {
    const [ev] = tripEvents({
      ...EMPTY,
      hotels: [
        {
          id: 'h1',
          name: 'Park Hotel',
          address: 'Shiodome',
          checkInDate: '2026-04-12',
          checkInTime: '15:00',
          checkOutDate: '2026-04-15',
          checkOutTime: null,
          nights: 3,
        },
      ],
    });
    expect(ev).toMatchObject({
      kind: 'timed',
      start: '2026-04-12',
      startTime: '15:00',
      end: '2026-04-15',
      endTime: '11:00',
    });
  });

  it('skips a hotel with an unparseable check-in date', () => {
    expect(
      tripEvents({
        ...EMPTY,
        hotels: [
          {
            id: 'h1',
            name: 'x',
            address: null,
            checkInDate: 'sometime',
            checkInTime: null,
            checkOutDate: null,
            checkOutTime: null,
            nights: null,
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe('tripEvents — transport', () => {
  it('falls back to an all-day span when there is no departure time', () => {
    const [ev] = tripEvents({
      ...EMPTY,
      transport: [
        {
          id: 'x1',
          title: 'Shinkansen',
          fromName: 'Tokyo',
          fromDate: '2026-04-12',
          fromTime: null,
          toName: 'Kyoto',
          toDate: '2026-04-12',
          toTime: null,
        },
      ],
    });
    expect(ev).toMatchObject({ kind: 'all-day', start: '2026-04-12', lastDay: '2026-04-12' });
  });
});
