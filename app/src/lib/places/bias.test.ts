import { describe, expect, it } from 'vitest';
import {
  biasQuery,
  normalizeBBox,
  originQuery,
  parseBiasParams,
  parseOriginParam,
  toGeoapifyBias,
  toGoogleBias,
  toPhotonParams,
} from './bias';

describe('parseBiasParams', () => {
  it('parses a point with the internal default radius', () => {
    expect(parseBiasParams(new URLSearchParams('near=13.7563,100.5018'))).toEqual({
      kind: 'point', lat: 13.7563, lng: 100.5018, radius: 10_000,
    });
  });

  it('clamps a numeric radius and defaults an invalid one', () => {
    expect(parseBiasParams(new URLSearchParams('near=1,2&radius=500'))).toMatchObject({ kind: 'point', radius: 1_000 });
    expect(parseBiasParams(new URLSearchParams('near=1,2&radius=999999'))).toMatchObject({ kind: 'point', radius: 50_000 });
    expect(parseBiasParams(new URLSearchParams('near=1,2&radius=abc'))).toMatchObject({ kind: 'point', radius: 10_000 });
  });

  it.each(['', '13.7,', ',100', 'a,b', '91,0', '0,181', '1,2,3', 'Infinity,0'])(
    'ignores malformed near=%s',
    (near) => {
      expect(parseBiasParams(new URLSearchParams({ near }))).toBeNull();
    },
  );

  it('leaves an absent near unset and accepts zero coordinates', () => {
    expect(parseBiasParams(new URLSearchParams())).toBeNull();
    expect(parseBiasParams(new URLSearchParams('near=0,0'))).toEqual({
      kind: 'point', lat: 0, lng: 0, radius: 10_000,
    });
  });

  it('parses a valid bbox as a rect', () => {
    expect(parseBiasParams(new URLSearchParams('bbox=1,2,3,4'))).toEqual({
      kind: 'rect', south: 1, west: 2, north: 3, east: 4,
    });
  });

  it('uses a valid bbox before near', () => {
    expect(parseBiasParams(new URLSearchParams('bbox=1,2,3,4&near=5,6'))).toEqual({
      kind: 'rect', south: 1, west: 2, north: 3, east: 4,
    });
  });

  it.each([
    '10,170,20,-170',
    '1,2,1,4',
    'NaN,2,3,4',
    '1,2,Infinity,4',
    '1,2,3',
    '-1,-1,1, ',
    '1,2,91,4',
    '0,0,20.5,1',
  ])('falls back to near when bbox=%s is invalid', (bbox) => {
    expect(parseBiasParams(new URLSearchParams({ bbox, near: '5,6' }))).toEqual({
      kind: 'point', lat: 5, lng: 6, radius: 10_000,
    });
  });

  it('accepts a rect whose spans are exactly 20 degrees', () => {
    expect(parseBiasParams(new URLSearchParams('bbox=0,0,20,20'))).toEqual({
      kind: 'rect', south: 0, west: 0, north: 20, east: 20,
    });
  });
});

describe('biasQuery', () => {
  it('omits no center and serializes an exact rounded center', () => {
    expect(biasQuery(null)).toBe('');
    expect(biasQuery({ lat: 13.75634, lng: 100.50177 })).toBe('&near=13.76%2C100.50');
  });

  it('serializes both bias forms when a valid bbox is available', () => {
    expect(biasQuery({ lat: 13.75634, lng: 100.50177 }, {
      south: 13.756, west: 100.494, north: 13.761, east: 100.507,
    })).toBe('&near=13.76%2C100.50&bbox=13.75%2C100.49%2C13.77%2C100.51');
    expect(biasQuery(null, { south: 1, west: 2, north: 3, east: 4 })).toBe('&bbox=1.00%2C2.00%2C3.00%2C4.00');
    expect(biasQuery({ lat: 1, lng: 2 }, { south: 1, west: 2, north: 1, east: 4 })).toBe('&near=1.00%2C2.00');
  });
});

describe('normalizeBBox', () => {
  it('rounds outward with an FP guard', () => {
    expect(normalizeBBox({ south: 13.756, west: 100.494, north: 13.761, east: 100.507 })).toEqual({
      south: 13.75, west: 100.49, north: 13.77, east: 100.51,
    });
    expect(normalizeBBox({ south: 0.29, west: 0, north: 1, east: 1 })).toEqual({
      south: 0.29, west: 0, north: 1, east: 1,
    });
    expect(normalizeBBox({ south: -1, west: -1, north: 0.07, east: 1 })).toEqual({
      south: -1, west: -1, north: 0.07, east: 1,
    });
  });

  it('keeps a sub-0.01 degree viewport non-empty', () => {
    expect(normalizeBBox({ south: 13.7561, west: 100.5011, north: 13.7589, east: 100.5039 })).toEqual({
      south: 13.75, west: 100.5, north: 13.76, east: 100.51,
    });
  });
});

describe('provider bias mappers', () => {
  const point = { kind: 'point' as const, lat: 13.75, lng: 100.5, radius: 10_000 };

  it('maps a point to the Google circle payload', () => {
    expect(toGoogleBias(point)).toEqual({
      circle: { center: { latitude: 13.75, longitude: 100.5 }, radius: 10_000 },
    });
  });

  it('maps a point to Geoapify lon-first circle bias', () => {
    expect(toGeoapifyBias(point)).toBe('circle:100.5,13.75,10000|countrycode:none');
  });

  it('maps a point to Photon latitude and longitude parameters', () => {
    expect(toPhotonParams(point)).toEqual({ lat: '13.75', lon: '100.5' });
  });

  it('maps a rect for every provider', () => {
    const rect = { kind: 'rect' as const, south: 1, west: 2, north: 3, east: 4 };
    expect(toGoogleBias(rect)).toEqual({
      rectangle: {
        low: { latitude: 1, longitude: 2 },
        high: { latitude: 3, longitude: 4 },
      },
    });
    expect(toGeoapifyBias(rect)).toBe('rect:2,1,4,3|countrycode:none');
    expect(toPhotonParams(rect)).toEqual({ lat: '2', lon: '3' });
  });
});

describe('parseOriginParam', () => {
  it('parses lat,lng', () => {
    expect(parseOriginParam(new URLSearchParams('origin=35.658,139.702'))).toEqual({ lat: 35.658, lng: 139.702 });
  });
  it('rejects NaN, out of range, wrong arity, blanks and a missing param', () => {
    for (const q of ['origin=NaN,1', 'origin=91,0', 'origin=0,181', 'origin=1,2,3', 'origin=1,', 'origin=,', 'origin=', '']) {
      expect(parseOriginParam(new URLSearchParams(q))).toBeNull();
    }
  });
});

describe('originQuery', () => {
  it('rounds to 3 decimals and encodes', () => {
    expect(originQuery({ lat: 35.65812, lng: 139.70161 })).toBe('&origin=35.658%2C139.702');
  });
  it('empty without an origin', () => {
    expect(originQuery(null)).toBe('');
    expect(originQuery(undefined)).toBe('');
  });
});
