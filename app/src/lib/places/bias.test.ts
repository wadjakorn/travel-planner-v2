import { describe, expect, it } from 'vitest';
import {
  biasQuery,
  parseBiasParams,
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
    expect(parseBiasParams(new URLSearchParams('near=1,2&radius=500'))?.radius).toBe(1_000);
    expect(parseBiasParams(new URLSearchParams('near=1,2&radius=999999'))?.radius).toBe(50_000);
    expect(parseBiasParams(new URLSearchParams('near=1,2&radius=abc'))?.radius).toBe(10_000);
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
});

describe('biasQuery', () => {
  it('omits no center and serializes an exact rounded center', () => {
    expect(biasQuery(null)).toBe('');
    expect(biasQuery({ lat: 13.75634, lng: 100.50177 })).toBe('&near=13.76%2C100.50');
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
});
