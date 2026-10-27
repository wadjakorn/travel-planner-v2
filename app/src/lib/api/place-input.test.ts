import { describe, it, expect } from 'vitest';
import { readPlaceLink, readPlaceExtras, parsePlaceFields, parseHttpUrl } from './place-input';

describe('parsePlaceFields status + sourceUrl', () => {
  const minimal = { kind: 'sight', name: 'X' };

  it('defaults status to confirmed and sourceUrl to null', () => {
    const f = parsePlaceFields({ ...minimal });
    expect(f.status).toBe('confirmed');
    expect(f.sourceUrl).toBeNull();
  });

  it('accepts status tbd', () => {
    expect(parsePlaceFields({ ...minimal, status: 'tbd' }).status).toBe('tbd');
  });

  it('rejects an unknown status', () => {
    expect(() => parsePlaceFields({ ...minimal, status: 'maybe' })).toThrow(/status/);
  });

  it('accepts an http(s) sourceUrl', () => {
    expect(parsePlaceFields({ ...minimal, sourceUrl: 'https://example.com/p' }).sourceUrl).toBe(
      'https://example.com/p',
    );
    expect(parsePlaceFields({ ...minimal, sourceUrl: 'http://example.com' }).sourceUrl).toBe(
      'http://example.com',
    );
  });

  it('rejects a javascript: sourceUrl with bad_request', () => {
    expect(() => parsePlaceFields({ ...minimal, sourceUrl: 'javascript:alert(1)' })).toThrow(
      /http or https/,
    );
  });

  it('rejects a data: sourceUrl', () => {
    expect(() => parsePlaceFields({ ...minimal, sourceUrl: 'data:text/html,x' })).toThrow();
  });

  it('rejects a malformed sourceUrl', () => {
    expect(() => parsePlaceFields({ ...minimal, sourceUrl: 'not a url' })).toThrow();
  });
});

describe('parseHttpUrl', () => {
  it('returns null when absent', () => {
    expect(parseHttpUrl(undefined)).toBeNull();
    expect(parseHttpUrl(null)).toBeNull();
    expect(parseHttpUrl('')).toBeNull();
  });
  it('accepts http/https', () => {
    expect(parseHttpUrl('https://x.test')).toBe('https://x.test');
  });
  it('rejects a non-http scheme', () => {
    expect(() => parseHttpUrl('javascript:alert(1)')).toThrow();
    expect(() => parseHttpUrl('ftp://x.test')).toThrow();
  });
});

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
