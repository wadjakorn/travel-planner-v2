import { describe, it, expect } from 'vitest';
import { readPlaceLink, readPlaceExtras } from './place-input';

describe('readPlaceLink', () => {
  it('returns null when absent', () => {
    expect(readPlaceLink({})).toBeNull();
  });
  it('trims', () => {
    expect(readPlaceLink({ googleMapsUrl: ' https://x ' })).toBe('https://x');
  });
  it('rejects a non-string', () => {
    expect(() => readPlaceLink({ googleMapsUrl: 5 })).toThrow();
  });
  it('rejects a string over 2048 chars', () => {
    expect(() => readPlaceLink({ googleMapsUrl: 'a'.repeat(2049) })).toThrow();
  });
  it('accepts exactly 2048 chars', () => {
    expect(readPlaceLink({ googleMapsUrl: 'a'.repeat(2048) })).toHaveLength(2048);
  });
});

describe('readPlaceExtras', () => {
  it('defaults every slot to null when absent', () => {
    expect(readPlaceExtras({})).toEqual({
      query: null,
      near: null,
      status: null,
      sourceUrl: null,
    });
  });

  it('accepts near as a {lat,lng} object', () => {
    expect(readPlaceExtras({ near: { lat: 48.8, lng: 2.3 } }).near).toEqual({
      lat: 48.8,
      lng: 2.3,
    });
  });

  it('accepts near as a "lat,lng" string', () => {
    expect(readPlaceExtras({ near: ' 48.8 , 2.3 ' }).near).toEqual({
      lat: 48.8,
      lng: 2.3,
    });
  });

  it('rejects a near string with an empty component (no silent lng:0)', () => {
    expect(() => readPlaceExtras({ near: '48.8,' })).toThrow(/"near"/);
  });

  it('rejects a near object missing a coordinate', () => {
    expect(() => readPlaceExtras({ near: { lat: 48.8 } })).toThrow(/"near"/);
  });

  it('accepts a valid status', () => {
    expect(readPlaceExtras({ status: 'tbd' }).status).toBe('tbd');
    expect(readPlaceExtras({ status: 'confirmed' }).status).toBe('confirmed');
  });

  it('rejects an unknown status', () => {
    expect(() => readPlaceExtras({ status: 'maybe' })).toThrow(/status/);
  });
});
