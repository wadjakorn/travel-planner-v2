import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import { makeT, withFallback } from './i18n-client';
import type { Pin } from './map-helpers';
import {
  POI_PREVIEW_OWNER,
  PREVIEW_FRAME_MAX_M,
  PREVIEW_ZOOM,
  createCachedLookup,
  createCoordsResolver,
  dayAnchor,
  formatNear,
  nearDistance,
  mapFocus,
  metersBetween,
  nearestStop,
  previewReducer,
  suggestionNear,
  toMapPreviewData,
  photoUriUrl,
  type MapPreview,
  type PreviewState,
} from './map-preview';
import type { Located, PlaceSuggestion } from './places/types';

const loc: Located = {
  id: 'google:ChIJabc', name: 'Wat Pho', secondary: 'Bangkok', address: '2 Sanam Chai Rd',
  lat: 13.74, lng: 100.49, kind: 'sight', timeZone: null,
};
const pin: Pin = { id: 'p1', idx: 1, kind: 'food', lat: 1, lng: 2 };
const pv = (ownerId: string, id = 'x'): MapPreview => ({
  ...toMapPreviewData({ ...loc, id }), ownerId, dayLabel: 'Day 1', onAdd: async () => true, onClose: () => {},
});
const s0: PreviewState = { preview: null, latest: 0 };

describe('previewReducer', () => {
  it('set with the current token applies', () => {
    const s1 = previewReducer(s0, { type: 'begin' });
    const s2 = previewReducer(s1, { type: 'set', preview: pv('a'), token: s1.latest });
    expect(s2.preview?.ownerId).toBe('a');
  });
  it('set with an older token (a newer begin happened) is ignored', () => {
    const s1 = previewReducer(s0, { type: 'begin' });
    const s2 = previewReducer(s1, { type: 'begin' });
    const s3 = previewReducer(s2, { type: 'set', preview: pv('a'), token: s1.latest });
    expect(s3.preview).toBeNull();
  });
  it('clear with another owner keeps the preview; clear() clears', () => {
    const s1 = previewReducer(s0, { type: 'begin' });
    const s2 = previewReducer(s1, { type: 'set', preview: pv('b'), token: s1.latest });
    expect(previewReducer(s2, { type: 'clear', ownerId: 'a' }).preview?.ownerId).toBe('b');
    expect(previewReducer(s2, { type: 'clear', ownerId: 'b' }).preview).toBeNull();
    expect(previewReducer(s2, { type: 'clear' }).preview).toBeNull();
  });
  it('a set started before a clear is ignored (late result after exit)', () => {
    const s1 = previewReducer(s0, { type: 'begin' });
    const s2 = previewReducer(s1, { type: 'clear', ownerId: 'a' });
    expect(previewReducer(s2, { type: 'set', preview: pv('a'), token: s1.latest }).preview).toBeNull();
  });
  it('latest strictly increases on begin and clear', () => {
    const s1 = previewReducer(s0, { type: 'begin' });
    const s2 = previewReducer(s1, { type: 'clear' });
    const s3 = previewReducer(s2, { type: 'clear', ownerId: 'zzz' });
    expect(s1.latest).toBeGreaterThan(s0.latest);
    expect(s2.latest).toBeGreaterThan(s1.latest);
    expect(s3.latest).toBeGreaterThan(s2.latest);
  });
});

describe('mapFocus', () => {
  type Args = [
    { lat: number; lng: number } | null,
    Pin | null,
    boolean,
    boolean?,
    boolean?,
  ];
  // The pre-TP-0095 positional cases, migrated as-is (pins: [pin]).
  const mf = (...[preview, activePin, activeChanged, previewExited, pinsChanged]: Args) =>
    mapFocus({ preview, activePin, activeChanged, previewExited, pinsChanged, pins: [pin] });
  it('nothing → fit', () => expect(mf(null, null, false)).toEqual({ kind: 'fit' }));
  it('active pin only → active', () => expect(mf(null, pin, false)).toEqual({ kind: 'active', lat: 1, lng: 2 }));
  it('preview beats a standing active pin', () =>
    expect(mf({ lat: 5, lng: 6 }, pin, false)).toEqual({ kind: 'preview', lat: 5, lng: 6 }));
  it('a freshly changed active pin beats the preview', () =>
    expect(mf({ lat: 5, lng: 6 }, pin, true)).toEqual({ kind: 'active', lat: 1, lng: 2 }));
  it('a preview that just exited keeps the camera where the user is looking', () => {
    expect(mf(null, null, false, true)).toEqual({ kind: 'stay' });
    expect(mf(null, pin, false, true)).toEqual({ kind: 'stay' });
  });
  it('…unless a place was just selected: then go to it', () =>
    expect(mf(null, pin, true, true)).toEqual({ kind: 'active', lat: 1, lng: 2 }));
  it('closing the active pin keeps the camera', () =>
    expect(mf(null, null, true, false, false)).toEqual({ kind: 'stay' }));
  it('…but a day switch that clears it refits the new day', () =>
    expect(mf(null, null, true, false, true)).toEqual({ kind: 'fit' }));
  it('…and an open preview still wins', () =>
    expect(mf({ lat: 5, lng: 6 }, null, true)).toEqual({ kind: 'preview', lat: 5, lng: 6 }));
  it('switching pins on a new pin set goes to the pin', () =>
    expect(mf(null, pin, true, false, true)).toEqual({ kind: 'active', lat: 1, lng: 2 }));
  it('PREVIEW_ZOOM is 14', () => expect(PREVIEW_ZOOM).toBe(14));

  const A: Pin = { id: 'a', idx: 1, kind: 'sight', lat: 35.66, lng: 139.7 };
  const B: Pin = { id: 'b', idx: 2, kind: 'food', lat: 35.67, lng: 139.71 };
  const base = { activePin: null, activeChanged: false };
  it('preview within 50 km of a stop frames the day with it', () => {
    const f = mapFocus({ ...base, preview: { lat: 35.68, lng: 139.72 }, pins: [A, B] });
    expect(f.kind).toBe('preview-fit');
    const pts = f.kind === 'preview-fit' ? f.points.map(({ lat, lng }) => ({ lat, lng })) : [];
    expect(pts).toEqual([
      { lat: 35.66, lng: 139.7 },
      { lat: 35.67, lng: 139.71 },
      { lat: 35.68, lng: 139.72 },
    ]);
  });
  it('preview far from every stop frames the preview alone', () =>
    expect(mapFocus({ ...base, preview: { lat: 34.69, lng: 135.5 }, pins: [A, B] })).toEqual({
      kind: 'preview',
      lat: 34.69,
      lng: 135.5,
    }));
  it('preview on an empty day frames the preview alone', () =>
    expect(mapFocus({ ...base, preview: { lat: 35.68, lng: 139.72 }, pins: [] }).kind).toBe('preview'));
  it('empty day uses the fallback', () =>
    expect(
      mapFocus({ preview: null, activePin: null, activeChanged: true, pinsChanged: true, pins: [], fallback: [{ lat: 1, lng: 2 }] }),
    ).toEqual({ kind: 'fallback', points: [{ lat: 1, lng: 2 }] }));
  it('empty day without a fallback stays', () =>
    expect(mapFocus({ ...base, preview: null, pins: [] })).toEqual({ kind: 'stay' }));
  it('a tapped map POI is revealed, never refit with the day', () => {
    const preview = { lat: 35.68, lng: 139.72, fromMap: true };
    expect(mapFocus({ ...base, preview, pins: [A, B] })).toEqual({ kind: 'preview-reveal', lat: 35.68, lng: 139.72 });
    expect(mapFocus({ ...base, preview, pins: [] })).toEqual({ kind: 'preview-reveal', lat: 35.68, lng: 139.72 });
  });
  it('a freshly selected pin still beats a POI preview', () =>
    expect(
      mapFocus({ preview: { lat: 35.68, lng: 139.72, fromMap: true }, activePin: pin, activeChanged: true, pins: [pin] }).kind,
    ).toBe('active'));
  it('PREVIEW_FRAME_MAX_M is 50 km', () => expect(PREVIEW_FRAME_MAX_M).toBe(50_000));
  it('POI_PREVIEW_OWNER is "poi"', () => expect(POI_PREVIEW_OWNER).toBe('poi'));
});

describe('toMapPreviewData', () => {
  it('prefers the resolved address, falls back to secondary', () => {
    expect(toMapPreviewData(loc).address).toBe('2 Sanam Chai Rd');
    expect(toMapPreviewData({ ...loc, address: '' }).address).toBe('Bangkok');
    expect(toMapPreviewData({ ...loc, address: null, secondary: null }).address).toBeNull();
  });
  it('builds a Google Maps search link', () => {
    expect(toMapPreviewData(loc).gmapsUrl.startsWith('https://www.google.com/maps/search/?api=1')).toBe(true);
  });
  it('carries the photo ref with attributions; no photo → null', () => {
    const photo = { name: 'places/ChIJabc/photos/P 1', attributions: [{ name: 'A', uri: 'https://x' }] };
    expect(toMapPreviewData({ ...loc, photo }).photo).toEqual(photo);
    expect(toMapPreviewData(loc).photo).toBeNull();
  });
  it('keeps exactly the data fields', () => {
    expect(Object.keys(toMapPreviewData(loc)).sort()).toEqual(['address', 'gmapsUrl', 'id', 'kind', 'lat', 'lng', 'name', 'photo']);
  });
});

describe('createCoordsResolver', () => {
  const sg = (id: string): PlaceSuggestion => ({ ...loc, id, lat: null, lng: null });
  it('dedupes concurrent calls and caches results', async () => {
    const fetchCoords = vi.fn(async (x: PlaceSuggestion) => ({ ...loc, id: x.id }));
    const r = createCoordsResolver(fetchCoords);
    const [a, b] = await Promise.all([r(sg('g:1')), r(sg('g:1'))]);
    expect(a).toBe(b);
    expect(await r(sg('g:1'))).toBe(a);
    expect(fetchCoords).toHaveBeenCalledTimes(1);
  });
  it('does not cache a null result', async () => {
    const fetchCoords = vi.fn(async () => null);
    const r = createCoordsResolver(fetchCoords);
    await r(sg('g:2'));
    await r(sg('g:2'));
    expect(fetchCoords).toHaveBeenCalledTimes(2);
  });
});

describe('createCachedLookup', () => {
  it('dedupes concurrent calls per key and caches hits', async () => {
    const f = vi.fn(async (k: string) => ({ k }));
    const look = createCachedLookup(f);
    const [a, b] = await Promise.all([look('x'), look('x')]);
    expect(a).toBe(b);
    expect(await look('x')).toBe(a);
    await look('y');
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('remembers a null answer for the session (no re-fetch), but retries after a throw', async () => {
    const none = vi.fn(async () => null);
    const look = createCachedLookup(none, { cacheNull: true });
    await look('x');
    await look('x');
    expect(none).toHaveBeenCalledTimes(1);
    let n = 0;
    const flaky = vi.fn(async () => { if (n++ === 0) throw new Error('net'); return 1; });
    const look2 = createCachedLookup(flaky, { cacheNull: true });
    expect(await look2('x')).toBeNull();
    expect(await look2('x')).toBe(1);
  });
});

describe('photoUriUrl', () => {
  it('encodes the photo name into the JSON route', () => {
    expect(photoUriUrl('places/A/photos/B 1')).toBe('/api/places/photo?name=places%2FA%2Fphotos%2FB%201');
  });
});

describe('createCachedLookup.peek', () => {
  it('is undefined until settled, then returns the cached value (null included with cacheNull)', async () => {
    const look = createCachedLookup(async (k: string) => (k === 'none' ? null : { k }), { cacheNull: true });
    expect(look.peek('x')).toBeUndefined();
    const v = await look('x');
    expect(look.peek('x')).toBe(v);
    await look('none');
    expect(look.peek('none')).toBeNull();
  });
});

describe('metersBetween', () => {
  it('Tokyo Tower to Shibuya Station is about 3.97 km', () => {
    const d = metersBetween({ lat: 35.6586, lng: 139.7454 }, { lat: 35.658, lng: 139.7016 });
    expect(Math.abs(d - 3970)).toBeLessThanOrEqual(30);
  });
  it('is 0 for the same point', () => {
    expect(metersBetween({ lat: 1, lng: 2 }, { lat: 1, lng: 2 })).toBe(0);
  });
});

const t = makeT(en);

describe('nearestStop', () => {
  const at = { lat: 35.6586, lng: 139.7454 };
  it('null without pins', () => {
    expect(nearestStop([], at)).toBeNull();
  });
  it('returns the closer pin, named or "Stop N"', () => {
    const near: Pin = { id: 'a', idx: 2, kind: 'food', lat: 35.659, lng: 139.745 };
    const far: Pin = { id: 'b', idx: 1, kind: 'sight', lat: 35.658, lng: 139.7016, name: 'Shibuya' };
    const r = nearestStop([far, near], at);
    expect(r?.stop).toBe(near);
    expect(r!.meters).toBeLessThan(100);
    expect(nearestStop([far], at)?.stop).toBe(far);
    expect(formatNear(r, 'metric', t)).toMatch(/ from Stop 2$/);
  });
});

const near = (name: string, meters: number) => ({ stop: { name, idx: 1 }, meters });

describe('formatNear', () => {
  it('metres, rounded to 10', () => {
    expect(formatNear(near('Tsuta Ramen', 347), 'metric', t)).toBe('≈ 350 m from Tsuta Ramen');
  });
  it('km with one decimal from 1 km', () => {
    expect(formatNear(near('Tsuta Ramen', 1234), 'metric', t)).toBe('≈ 1.2 km from Tsuta Ramen');
    expect(formatNear(near('X', 996), 'metric', t)).toBe('≈ 1.0 km from X');
  });
  it('imperial', () => {
    expect(formatNear(near('X', 347), 'imperial', t)).toMatch(/ft from X$/);
    expect(formatNear(near('X', 4000), 'imperial', t)).toMatch(/mi from X$/);
  });
  it('null in, null out', () => {
    expect(formatNear(null, 'metric', t)).toBeNull();
  });
  it('reads the caller’s language', () => {
    expect(formatNear(near('X', 347), 'metric', makeT(withFallback(en, th)))).toBe('≈ 350 m จาก X');
  });
});

describe('formatNear: whole km from 100 km', () => {
  it('812.3 km reads 812 km', () => {
    expect(formatNear(near('X', 812_345), 'metric', t)).toBe('≈ 812 km from X');
    expect(formatNear(near('X', 9_012_400), 'metric', t)).toBe('≈ 9012 km from X');
  });
  it('below 100 km keeps one decimal', () => {
    expect(formatNear(near('X', 99_940), 'metric', t)).toBe('≈ 99.9 km from X');
  });
});

describe('nearDistance', () => {
  it('formats in the user units, null when it would read 0', () => {
    expect(nearDistance(1234, 'metric')).toBe('1.2 km');
    expect(nearDistance(347, 'imperial')).toMatch(/ ft$/);
    expect(nearDistance(4, 'metric')).toBeNull();
    expect(nearDistance(0, 'imperial')).toBeNull();
  });
});

describe('suggestion distance', () => {
  const pins: Pin[] = [
    { id: 'a', idx: 1, kind: 'sight', lat: 35.6586, lng: 139.7454, name: 'Tokyo Tower' },
    { id: 'h', idx: 2, kind: 'hotel', lat: 35.658, lng: 139.7016, name: 'Shibuya Stream Hotel' },
  ];
  const sug = (o: Partial<PlaceSuggestion>): PlaceSuggestion => ({
    id: 'x', name: 'X', secondary: null, address: null, lat: null, lng: null, kind: 'food', timeZone: null, ...o,
  });

  it('coords → nearest stop', () => {
    expect(suggestionNear(sug({ lat: 35.6584, lng: 139.7018 }), pins, 'metric', t)).toEqual({ dist: '50 m', name: 'Shibuya Stream Hotel' });
  });
  it('no coords + distanceMeters → anchor (last pin)', () => {
    expect(suggestionNear(sug({ distanceMeters: 1234 }), pins, 'metric', t)).toEqual({ dist: '1.2 km', name: 'Shibuya Stream Hotel' });
  });
  it('coords win over distanceMeters', () => {
    expect(suggestionNear(sug({ lat: 35.659, lng: 139.7454, distanceMeters: 99999 }), pins, 'metric', t)).toEqual({ dist: '40 m', name: 'Tokyo Tower' });
  });
  it('hidden when it would read ≈ 0 m (D6)', () => {
    expect(suggestionNear(sug({ lat: 35.6586, lng: 139.7454 }), pins, 'metric', t)).toBeNull();
    expect(suggestionNear(sug({ distanceMeters: 3 }), pins, 'metric', t)).toBeNull();
  });
  it('unnamed anchor reads "Stop N"', () => {
    expect(suggestionNear(sug({ distanceMeters: 500 }), [{ ...pins[1], name: undefined }], 'metric', t)?.name).toBe('Stop 2');
  });
  it('empty day → null', () => {
    expect(suggestionNear(sug({ lat: 1, lng: 2 }), [], 'metric', t)).toBeNull();
    expect(suggestionNear(sug({ distanceMeters: 500 }), [], 'metric', t)).toBeNull();
  });
  it('neither → null', () => {
    expect(suggestionNear(sug({}), pins, 'metric', t)).toBeNull();
  });
  it('dayAnchor: last pin, null for []', () => {
    expect(dayAnchor(pins)?.id).toBe('h');
    expect(dayAnchor([])).toBeNull();
  });
});
