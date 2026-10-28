import { describe, expect, it, vi } from 'vitest';
import type { Pin } from './map-helpers';
import {
  PREVIEW_ZOOM,
  createCoordsResolver,
  mapFocus,
  photoSrc,
  previewReducer,
  toMapPreviewData,
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
  it('nothing → fit', () => expect(mapFocus(null, null, false)).toEqual({ kind: 'fit' }));
  it('active pin only → active', () => expect(mapFocus(null, pin, false)).toEqual({ kind: 'active', lat: 1, lng: 2 }));
  it('preview beats a standing active pin', () =>
    expect(mapFocus({ lat: 5, lng: 6 }, pin, false)).toEqual({ kind: 'preview', lat: 5, lng: 6 }));
  it('a freshly changed active pin beats the preview', () =>
    expect(mapFocus({ lat: 5, lng: 6 }, pin, true)).toEqual({ kind: 'active', lat: 1, lng: 2 }));
  it('PREVIEW_ZOOM is 14', () => expect(PREVIEW_ZOOM).toBe(14));
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
  it('maps the photo to the proxy src with attributions; no photo → null', () => {
    const photo = { name: 'places/ChIJabc/photos/P 1', attributions: [{ name: 'A', uri: 'https://x' }] };
    expect(toMapPreviewData({ ...loc, photo }).photo).toEqual({
      src: '/api/places/photo?name=places%2FChIJabc%2Fphotos%2FP%201', attributions: photo.attributions,
    });
    expect(toMapPreviewData(loc).photo).toBeNull();
    expect(photoSrc(photo)).toBe('/api/places/photo?name=places%2FChIJabc%2Fphotos%2FP%201');
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
