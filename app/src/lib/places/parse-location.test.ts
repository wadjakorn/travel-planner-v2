import { describe, expect, it } from 'vitest';
import { formatLatLng, parseLocationInput } from './parse-location';

describe('parseLocationInput', () => {
  it.each(['35.6812, 139.7671', '35.6812,139.7671', '35.6812 139.7671', '(35.6812, 139.7671)'])(
    'reads the decimal pair %j',
    (raw) => {
      expect(parseLocationInput(raw)).toEqual({ ok: true, lat: 35.6812, lng: 139.7671, source: 'coords' });
    },
  );

  it('reads degree + hemisphere coordinates (Apple Maps style)', () => {
    expect(parseLocationInput('35.6812° N, 139.7671° E')).toEqual({
      ok: true,
      lat: 35.6812,
      lng: 139.7671,
      source: 'coords',
    });
    expect(parseLocationInput('33.8688° S, 151.2093° E')).toEqual({
      ok: true,
      lat: -33.8688,
      lng: 151.2093,
      source: 'coords',
    });
    const west = parseLocationInput('40.7128° N, 74.006° W');
    expect(west.ok && west.lng).toBe(-74.006);
  });

  it('keeps a negative sign', () => {
    const r = parseLocationInput('-33.8688, 151.2093');
    expect(r.ok && r.lat).toBe(-33.8688);
  });

  it('rejects out-of-range pairs, including a swapped lng/lat', () => {
    expect(parseLocationInput('139.7671, 35.6812')).toEqual({ ok: false, reason: 'out_of_range' });
    expect(parseLocationInput('91, 0')).toEqual({ ok: false, reason: 'out_of_range' });
  });

  it('reads the exact pin from a place link', () => {
    expect(
      parseLocationInput(
        'https://www.google.com/maps/place/Tokyo+Tower/@35.6585,139.7454,17z/data=!3d35.6585805!4d139.7454329',
      ),
    ).toEqual({ ok: true, lat: 35.6585805, lng: 139.7454329, source: 'link' });
  });

  it('reads a ?q= coordinate link', () => {
    const r = parseLocationInput('https://maps.google.com/?q=35.6812,139.7671');
    expect(r).toMatchObject({ ok: true, source: 'link' });
    expect(r.ok && r.lat).toBe(35.6812);
  });

  it('flags a link without coordinates', () => {
    expect(parseLocationInput('https://www.google.com/maps/search/ramen')).toEqual({
      ok: false,
      reason: 'no_coords',
    });
  });

  it('flags a short link', () => {
    expect(parseLocationInput('https://maps.app.goo.gl/abc123')).toEqual({ ok: false, reason: 'short_link' });
  });

  it('returns empty for blank input', () => {
    expect(parseLocationInput('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseLocationInput('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects anything else', () => {
    expect(parseLocationInput('Tokyo Tower')).toEqual({ ok: false, reason: 'unrecognized' });
    expect(parseLocationInput('35,6812 139,7671')).toEqual({ ok: false, reason: 'unrecognized' });
  });
});

describe('formatLatLng', () => {
  it('prints five decimals', () => {
    expect(formatLatLng({ lat: 35.6812, lng: 139.7671 })).toBe('35.68120, 139.76710');
  });
});
