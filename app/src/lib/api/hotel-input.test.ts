import { describe, it, expect } from 'vitest';
import { parseHotelFields, readHotelLink, renamedForArea } from './hotel-input';
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
      status: 'confirmed',
    });
  });

  it('throws bad_request when name is missing or blank', () => {
    expect(() => parseHotelFields({ address: 'x' })).toThrow(ServiceError);
    expect(() => parseHotelFields({ name: '  ' })).toThrow('"name" is required');
  });

  it('validates field value types (400, not a DB error)', () => {
    expect(() => parseHotelFields({ name: 'H', lat: 'nope' })).toThrow('"lat" must be a number');
    expect(() => parseHotelFields({ name: 'H', nights: 1.5 })).toThrow('"nights" must be an integer');
    expect(() => parseHotelFields({ name: 'H', address: 42 })).toThrow('"address" must be a string');
    expect(() => parseHotelFields({ name: 'H', arrivalMode: 'fly' })).toThrow(
      '"arrivalMode" must be one of: drive, walk, transit',
    );
  });

  it('rejects hotel dates that are not real YYYY-MM-DD calendar dates', () => {
    expect(() => parseHotelFields({ name: 'H', checkInDate: '2026-02-31' })).toThrow(
      '"checkInDate" must be a valid YYYY-MM-DD date',
    );
    expect(() => parseHotelFields({ name: 'H', checkOutDate: '11/05/2026' })).toThrow(
      /"checkOutDate" must be a valid YYYY-MM-DD date/,
    );
    expect(() => parseHotelFields({ name: 'H', checkInDate: 20261101 })).toThrow(
      /"checkInDate" must be a valid YYYY-MM-DD date/,
    );
  });

  it('accepts valid typed fields', () => {
    const out = parseHotelFields({
      name: 'H',
      lat: 34.98,
      lng: 135.75,
      nights: 2,
      costAmount: 50000,
      arrivalMode: 'transit',
    });
    expect(out).toEqual({
      name: 'H',
      lat: 34.98,
      lng: 135.75,
      nights: 2,
      costAmount: 50000,
      arrivalMode: 'transit',
      status: 'confirmed',
    });
  });
});

describe('TP-0143 tbd hotels', () => {
  it('tbd hotel without name takes area as name', () => {
    expect(parseHotelFields({ status: 'tbd', area: 'Dogo Onsen, Matsuyama' }))
      .toMatchObject({ name: 'Dogo Onsen, Matsuyama', area: 'Dogo Onsen, Matsuyama', status: 'tbd' });
  });
  it('tbd hotel with neither name nor area is a 400', () => {
    expect(() => parseHotelFields({ status: 'tbd' })).toThrow('"name" or "area" is required for a tbd hotel');
  });
  it('confirmed hotel still requires name even with area', () => {
    expect(() => parseHotelFields({ area: 'Shinjuku' })).toThrow('"name" is required');
  });
  it('defaults status to confirmed and rejects unknown status', () => {
    expect(parseHotelFields({ name: 'H' }).status).toBe('confirmed');
    expect(() => parseHotelFields({ name: 'H', status: 'maybe' })).toThrow('"status" must be one of: confirmed, tbd');
  });
  it('readHotelLink reads url/query/near and the approx echo', () => {
    expect(readHotelLink({ googleMapsUrl: ' https://maps.app.goo.gl/x ', query: 'Hotel X', near: '34.9,135.7', coordsApprox: true }))
      .toEqual({ googleMapsUrl: 'https://maps.app.goo.gl/x', query: 'Hotel X', near: { lat: 34.9, lng: 135.7 }, approxEcho: true });
    expect(() => readHotelLink({ coordsApprox: 'yes' })).toThrow('"coordsApprox" must be a boolean');
  });
  it('renamedForArea follows area only while name === area', () => {
    const cur = { name: 'Dogo', area: 'Dogo' };
    expect(renamedForArea(cur, { area: 'Okaido' })).toBe('Okaido');
    expect(renamedForArea(cur, { area: 'Okaido', name: 'Kept' })).toBeUndefined();
    expect(renamedForArea({ name: 'Hotel X', area: 'Dogo' }, { area: 'Okaido' })).toBeUndefined();
  });
  it('renamedForArea never returns empty for a cleared area', () => {
    expect(renamedForArea({ name: 'Dogo', area: 'Dogo' }, { area: null })).toBeUndefined();
    expect(renamedForArea({ name: 'Dogo', area: 'Dogo' }, { area: '  ' })).toBeUndefined();
  });
});
