import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSuggestions, resolvePlace } from './client';
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
    expect(await resolvePlace(s)).toEqual({ ...s, phone: null, website: null, hours: null });
  });
  it('does not call details for osm ids', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await resolvePlace({ ...s, id: 'osm:N1' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('fetchSuggestions', () => {
  it('empty result on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    expect(await fetchSuggestions('wat')).toEqual({ results: [], linkError: null });
  });
});
