import { describe, expect, it } from 'vitest';
import { gmapsDirectionsUrl, gmapsSearchUrl } from './gmaps';

const legacy = { name: 'Wat Pho', lat: 13.7465, lng: 100.4927, placeIdExternal: 'ChIJabc' };
const geo = { name: 'Ristr8to', lat: 18.7999, lng: 98.9676, placeIdExternal: 'geoapify:51ff' };
const manual = { name: 'Pin', lat: 13.1, lng: 100.2, placeIdExternal: null };

describe('gmapsSearchUrl', () => {
  it('passes query_place_id for legacy Google ids', () => {
    expect(gmapsSearchUrl(legacy)).toContain('query_place_id=ChIJabc');
  });
  it('uses coordinates and no place id for non-Google ids', () => {
    const u = gmapsSearchUrl(geo);
    expect(u).not.toContain('query_place_id');
    expect(u).toContain(`query=${encodeURIComponent('18.7999,98.9676')}`);
  });
  it('uses coordinates for manual pins', () => {
    expect(gmapsSearchUrl(manual)).toContain(encodeURIComponent('13.1,100.2'));
  });
});

describe('gmapsDirectionsUrl', () => {
  it('only sends place ids that are Google ids', () => {
    const u = gmapsDirectionsUrl([legacy, geo]);
    expect(u).toContain('origin_place_id=ChIJabc');
    expect(u).not.toContain('destination_place_id');
    expect(u).toContain(`destination=${encodeURIComponent('18.7999,98.9676')}`);
  });
  it('omits waypoint_place_ids when any waypoint is non-Google', () => {
    const u = gmapsDirectionsUrl([legacy, geo, legacy]);
    expect(u).not.toContain('waypoint_place_ids');
  });
});

describe('gmapsSearchUrl with gcid', () => {
  it('opens the place by CID', () => {
    expect(gmapsSearchUrl({ name: 'Jay Fai', lat: 1, lng: 2, placeIdExternal: 'gcid:123' })).toBe(
      'https://maps.google.com/?cid=123',
    );
  });
  it('is unchanged for other providers', () => {
    expect(gmapsSearchUrl({ name: 'Jay Fai', lat: 1, lng: 2, placeIdExternal: 'geoapify:x' })).toContain(
      `query=${encodeURIComponent('1,2')}`,
    );
  });
  it('escapes the cid', () => {
    expect(gmapsSearchUrl({ name: 'x', placeIdExternal: 'gcid:1&q=x' })).toBe('https://maps.google.com/?cid=1%26q%3Dx');
  });
});
