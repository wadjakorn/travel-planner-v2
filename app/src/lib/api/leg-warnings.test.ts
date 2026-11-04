import { describe, it, expect } from 'vitest';
import { transitAsPlaceWarning } from '@/lib/api/leg-warnings';
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
