import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import { makeT } from './i18n-client';
import {
  FIT_MAX_ZOOM,
  FIT_PADDING,
  centroid,
  emptyDayFallback,
  emptyDayNote,
  fitPadding,
  frameSig,
  initialCamera,
  isTripMapVisible,
  pinBounds,
  pinPopups,
  toGoogleBounds,
  type Pin,
} from './map-helpers';
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
  it('md+: keeps bottom-anchored drops clear of the day bar at the top', () => {
    expect(fitPadding(false)).toEqual({ top: 62 + 64, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING });
  });
  it('keeps pins above the mobile strip', () => {
    expect(fitPadding(true)).toEqual({ top: 72, right: FIT_PADDING, bottom: 162, left: FIT_PADDING });
  });
});

describe('centroid / initialCamera', () => {
  it('centroid of nothing is null (no hardcoded city)', () => expect(centroid([])).toBeNull());
  it('no points, no preview → world view', () =>
    expect(initialCamera([], null)).toEqual({ center: { lat: 20, lng: 0 }, zoom: 2 }));
  it('no points, a preview → the preview at FIT_MAX_ZOOM', () =>
    expect(initialCamera([], { lat: 13.7, lng: 100.5 })).toEqual({ center: { lat: 13.7, lng: 100.5 }, zoom: 14 }));
  it('points → their centroid and derived zoom', () => {
    const cam = initialCamera([pin(35, 139), pin(35.02, 139.02)], { lat: 1, lng: 1 });
    expect(cam.center.lat).toBeCloseTo(35.01, 9);
    expect(cam.center.lng).toBeCloseTo(139.01, 9);
    expect(cam.zoom).toBe(14);
  });
  it('never Tokyo', () => expect(JSON.stringify(initialCamera([], null))).not.toContain('139.74'));
});

describe('emptyDayFallback', () => {
  const A = pin(35.66, 139.7);
  const B = pin(35.67, 139.71);
  const S = pin(34.69, 135.5);
  const H: Pin = { id: 'h', idx: 1, kind: 'hotel', lat: 34.7, lng: 135.49 };
  const day = (idx: number, pins: Pin[]) => ({ idx, pins });
  it('uses the nearest earlier day with pins', () =>
    expect(emptyDayFallback([day(0, [A, B]), day(1, []), day(2, [])], 2)).toEqual({
      from: 'prev-day',
      dayIdx: 0,
      points: [A, B],
    }));
  it('prefers the closest earlier day', () =>
    expect(emptyDayFallback([day(0, [A]), day(1, [S]), day(2, [])], 2)).toMatchObject({ dayIdx: 1, points: [S] }));
  it('else the upcoming stay', () =>
    expect(emptyDayFallback([day(0, []), day(1, [S]), day(2, [H])], 0)).toEqual({ from: 'stay', points: [H] }));
  it('else the whole trip', () =>
    expect(emptyDayFallback([day(0, []), day(1, [S])], 0)).toEqual({ from: 'trip', points: [S] }));
  it('null when the trip has no located place', () =>
    expect(emptyDayFallback([day(0, []), day(1, [])], 0)).toBeNull());
  it('null when the day itself has pins', () => expect(emptyDayFallback([day(0, [A])], 0)).toBeNull());
});

describe('emptyDayNote', () => {
  const t = makeT(en);
  it('names the fallback', () => {
    expect(emptyDayNote(3, { from: 'prev-day', dayIdx: 1, points: [] }, t)).toBe('No places on Day 3 yet · showing Day 2');
    expect(emptyDayNote(1, { from: 'stay', points: [] }, t)).toBe('No places on Day 1 yet · showing your stay');
    expect(emptyDayNote(1, { from: 'trip', points: [] }, t)).toBe('No places on Day 1 yet · showing the whole trip');
  });
});

describe('frameSig', () => {
  const a: Pin = { id: 'a', idx: 1, kind: 'sight', lat: 1, lng: 2 };
  const b: Pin = { id: 'b', idx: 2, kind: 'sight', lat: 3, lng: 4 };
  it('is the pin ids when the day has pins', () => expect(frameSig([a, b], [])).toBe('a|b'));
  it('is the fallback frame on an empty day', () => expect(frameSig([], [{ lat: 1, lng: 2 }])).toBe('fallback:1,2'));
  it('is empty with neither', () => expect(frameSig([], [])).toBe(''));
});

describe('pinPopups', () => {
  const base = { hoveredId: null, activeId: null, preview: false, hideCard: false };
  it('nothing active or hovered', () =>
    expect(pinPopups(base)).toEqual({ cardId: null, tipId: null }));
  it('hovering another pin keeps the card and adds a tooltip', () =>
    expect(pinPopups({ ...base, hoveredId: 'b', activeId: 'a' })).toEqual({ cardId: 'a', tipId: 'b' }));
  it('hovering the active pin adds no tooltip', () =>
    expect(pinPopups({ ...base, hoveredId: 'a', activeId: 'a' })).toEqual({ cardId: 'a', tipId: null }));
  it('hover only', () =>
    expect(pinPopups({ ...base, hoveredId: 'b' })).toEqual({ cardId: null, tipId: 'b' }));
  it('mobile strip hides the card', () =>
    expect(pinPopups({ ...base, activeId: 'a', hideCard: true })).toEqual({ cardId: null, tipId: null }));
  it('a search preview suppresses both', () =>
    expect(pinPopups({ ...base, hoveredId: 'b', activeId: 'a', preview: true })).toEqual({ cardId: null, tipId: null }));
});
