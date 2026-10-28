import { describe, expect, it } from 'vitest';
import { FIT_MAX_ZOOM, FIT_PADDING, fitPadding, isTripMapVisible, pinBounds, toGoogleBounds, type Pin } from './map-helpers';
import { pinGoogleId } from './map-helpers';

const pin = (lat: number, lng: number): Pin => ({ id: `${lat},${lng}`, idx: 1, kind: 'sight', lat, lng });

describe('pinBounds', () => {
  it('returns [[minLng,minLat],[maxLng,maxLat]] for 2+ pins', () => {
    expect(pinBounds([pin(35, 139), pin(34, 140), pin(36, 138)])).toEqual([[138, 34], [140, 36]]);
  });
  it('returns null for 0 or 1 pin', () => {
    expect(pinBounds([])).toBeNull();
    expect(pinBounds([pin(35, 139)])).toBeNull();
  });
});

describe('toGoogleBounds', () => {
  it('maps [[west,south],[east,north]] to a LatLngBoundsLiteral', () => {
    expect(toGoogleBounds([[100.49, 13.74], [100.52, 13.76]])).toEqual({
      south: 13.74,
      west: 100.49,
      north: 13.76,
      east: 100.52,
    });
  });
  it('shares MapLibre fit constants', () => {
    expect(FIT_PADDING).toBe(48);
    expect(FIT_MAX_ZOOM).toBe(14);
  });
});

describe('isTripMapVisible', () => {
  it('is visible on wide screens', () => {
    expect(isTripMapVisible(true, undefined)).toBe(true);
  });
  it('is visible on narrow screens only in full-map mode', () => {
    expect(isTripMapVisible(false, '1')).toBe(true);
    expect(isTripMapVisible(false, undefined)).toBe(false);
    expect(isTripMapVisible(false, '0')).toBe(false);
  });
});

describe('pinGoogleId', () => {
  it('keeps only Google place ids', () => {
    expect(pinGoogleId('ChIJabc')).toBe('ChIJabc');
    for (const id of ['gcid:123', 'geoapify:x', 'osm:N1', '', null, undefined]) expect(pinGoogleId(id)).toBeNull();
  });
});

describe('fitPadding', () => {
  it('is uniform without the strip', () => {
    expect(fitPadding(false)).toEqual({ top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING });
  });
  it('keeps pins above the mobile strip', () => {
    expect(fitPadding(true)).toEqual({ top: 72, right: FIT_PADDING, bottom: 240, left: FIT_PADDING });
  });
});
