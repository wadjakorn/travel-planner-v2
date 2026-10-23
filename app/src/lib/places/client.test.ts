import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureCoords, fetchSuggestions, resolvePlace } from './client';
import type { PlaceSuggestion } from './types';

const s: PlaceSuggestion = {
  id: 'geoapify:g1', name: 'Ristr8to', secondary: 'Chiang Mai', address: 'Nimman, Chiang Mai',
  lat: 18.8, lng: 98.97, kind: 'food', timeZone: 'Asia/Bangkok',
};

afterEach(() => vi.unstubAllGlobals());

describe('resolvePlace', () => {
  it('merges details over the suggestion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ place: { ...s, phone: '053', website: null, hours: 'Mo-Su 07:00-18:00' } }))));
    expect(await resolvePlace(s)).toMatchObject({ name: 'Ristr8to', phone: '053', hours: 'Mo-Su 07:00-18:00' });
  });
  it('falls back to suggestion data when details fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect(await resolvePlace(s)).toEqual({ ...s, phone: null, website: null, hours: null, rating: null, reviews: null });
  });
  it('does not call details for osm ids', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await resolvePlace({ ...s, id: 'osm:N1' });
    expect(f).not.toHaveBeenCalled();
  });
});

const SESS = '11111111-1111-4111-8111-111111111111';
const gs: PlaceSuggestion = { ...s, id: 'ChIJabc', lat: null, lng: null, address: null, timeZone: null };
const detail = { ...s, id: 'ChIJabc', phone: null, website: null, hours: null, rating: 4.4, reviews: 9 };

describe('session + google paths', () => {
  it('resolve defaults to fields=basic (cost trap)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ place: detail })));
    vi.stubGlobal('fetch', f);
    await resolvePlace({ ...s, id: 'geoapify:abc' }, { session: SESS });
    expect((f.mock.calls as unknown[][])[0][0]).toBe(`/api/places/details?id=geoapify%3Aabc&lang=en&session=${SESS}&fields=basic`);
  });
  it('geoapify resolve sends session and fields=full', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ place: null })));
    vi.stubGlobal('fetch', f);
    const out = await resolvePlace({ ...s, id: 'geoapify:abc' }, { session: SESS, fields: 'full' });
    expect((f.mock.calls as unknown[][])[0][0]).toBe(`/api/places/details?id=geoapify%3Aabc&lang=en&session=${SESS}&fields=full`);
    expect(out).toMatchObject({ lat: 18.8, rating: null, reviews: null });
  });
  it('google suggestion takes details coords; null if details fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ place: detail }))));
    expect(await resolvePlace(gs, { session: SESS })).toMatchObject({ lat: 18.8, rating: 4.4 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect(await resolvePlace(gs, { session: SESS })).toBeNull();
  });
  it('osm resolve makes no fetch', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await resolvePlace({ ...s, id: 'osm:N1' })).toMatchObject({ lat: 18.8 });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('ensureCoords', () => {
  it('passes through located suggestions without fetching', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await ensureCoords(s, SESS)).toBe(s);
    expect(f).not.toHaveBeenCalled();
  });
  it('fetches basic details for null coords', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ place: detail })));
    vi.stubGlobal('fetch', f);
    const out = await ensureCoords(gs, SESS);
    expect((f.mock.calls as unknown[][])[0][0]).toBe(`/api/places/details?id=ChIJabc&lang=en&session=${SESS}&fields=basic`);
    expect(out).toMatchObject({ lat: 18.8, lng: 98.97, address: 'Nimman, Chiang Mai', timeZone: 'Asia/Bangkok', name: 'Ristr8to' });
  });
  it('null when details fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect(await ensureCoords(gs, SESS)).toBeNull();
  });
});

describe('fetchSuggestions', () => {
  it('adds session param only when given', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ results: [] })));
    vi.stubGlobal('fetch', f);
    await fetchSuggestions('x', undefined, 'S');
    await fetchSuggestions('x');
    expect((f.mock.calls as unknown[][])[0][0]).toBe('/api/places/autocomplete?q=x&session=S');
    expect((f.mock.calls as unknown[][])[1][0]).toBe('/api/places/autocomplete?q=x');
  });
  it('[] on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    expect(await fetchSuggestions('wat')).toEqual([]);
  });
});
