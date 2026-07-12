import { describe, it, expect } from 'vitest';
import { parseHotelFields } from './hotel-input';
import { ServiceError } from '@/lib/services/service-error';

describe('parseHotelFields', () => {
  it('keeps only whitelisted fields and requires name', () => {
    const out = parseHotelFields({
      name: 'Hotel Granvia',
      checkInDate: '2026-11-01',
      lat: 34.98,
      placeIdExternal: 'ChIJ123',
      dayIdx: 0,
      id: 'HACK', // server-managed, must be dropped
      tripId: 'HACK', // dropped
      bogus: 'nope', // unknown, dropped
    });
    expect(out).toEqual({
      name: 'Hotel Granvia',
      checkInDate: '2026-11-01',
      lat: 34.98,
      placeIdExternal: 'ChIJ123',
      dayIdx: 0,
    });
  });

  it('throws bad_request when name is missing or blank', () => {
    expect(() => parseHotelFields({ address: 'x' })).toThrow(ServiceError);
    expect(() => parseHotelFields({ name: '  ' })).toThrow('"name" is required');
  });
});
