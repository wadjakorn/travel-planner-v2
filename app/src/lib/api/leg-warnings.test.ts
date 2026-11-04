import { describe, it, expect } from 'vitest';
import { transitAsPlaceWarning, collectLegWarnings } from '@/lib/api/leg-warnings';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import type { PlaceFields } from '@/lib/services/place-service';

const base: PlaceFields = {
  kind: 'transit',
  status: 'confirmed',
  sourceUrl: null,
  name: 'Shinkansen',
  category: null,
  rating: null,
  reviews: null,
  time: null,
  duration: null,
  price: null,
  address: null,
  phone: null,
  website: null,
  hours: null,
  tags: null,
  thumb: null,
  note: null,
  lat: null,
  lng: null,
  placeIdExternal: null,
};

describe('transitAsPlaceWarning', () => {
  it('fires for a transit stop with no location', () => {
    expect(transitAsPlaceWarning(base, null)).toEqual({
      code: 'transit_as_place',
      name: 'Shinkansen',
      message: `This transit stop has no location; put the travel on the next stop's "arrive" instead.`,
    });
  });

  it('carries the path when given', () => {
    expect(transitAsPlaceWarning(base, null, '/days/0/places/1')?.path).toBe('/days/0/places/1');
  });

  it('is null when an address is present', () => {
    expect(transitAsPlaceWarning({ ...base, address: 'Tokyo Station' }, null)).toBeNull();
  });

  it('is null when a link is present', () => {
    expect(transitAsPlaceWarning(base, 'https://maps.app.goo.gl/x')).toBeNull();
  });

  it('is null when coords are present', () => {
    expect(transitAsPlaceWarning({ ...base, lat: 35.68, lng: 139.76 }, null)).toBeNull();
    expect(transitAsPlaceWarning({ ...base, lat: 35.68 }, null)).toBeNull();
  });

  it('is null for a non-transit kind', () => {
    expect(transitAsPlaceWarning({ ...base, kind: 'sight' }, null)).toBeNull();
  });
});

describe('collectLegWarnings', () => {
  const walk = { mode: 'walk' as const, durationMin: 10, note: null };
  const sight = (name: string) => ({ ...base, kind: 'sight' as const, name, lat: 35, lng: 135 });
  const plan = (over: Partial<ParsedImportPlan>): ParsedImportPlan => ({
    trip: { title: 'T', subtitle: null, startDate: '2030-01-01', endDate: '2030-01-03', cover: null },
    days: [],
    hotels: [],
    ...over,
  });

  it('arrive_without_origin once per day', () => {
    const p = plan({
      days: [{ date: null, places: [sight('A'), sight('B')], arrives: [walk, walk] }],
    });
    const out = collectLegWarnings(p, [[null, null]]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      code: 'arrive_without_origin',
      path: '/days/0/places/0/arrive',
      name: 'A',
    });
    expect(out[0].message).toBe(
      `This day has no hotel to leave from; the first stop's "arrive" is stored but not shown.`,
    );
  });

  it('no arrive_without_origin when a hotel covers the previous night', () => {
    const p = plan({
      days: [
        { date: null, places: [sight('A')], arrives: [null] },
        { date: null, places: [sight('B')], arrives: [walk] },
      ],
      hotels: [
        { name: 'H', checkInDate: '2030-01-01', checkOutDate: '2030-01-03' } as ParsedImportPlan['hotels'][number],
      ],
    });
    expect(collectLegWarnings(p, [[null], [null]])).toEqual([]);
  });

  it('flags a coordless transit place as transit_as_place with its name', () => {
    const p = plan({
      days: [{ date: null, places: [sight('A'), { ...base }], arrives: [null, null] }],
    });
    expect(collectLegWarnings(p, [[null, null]])).toEqual([
      expect.objectContaining({ code: 'transit_as_place', path: '/days/0/places/1', name: 'Shinkansen' }),
    ]);
  });
});
