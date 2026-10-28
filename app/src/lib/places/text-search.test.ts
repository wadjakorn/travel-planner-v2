import { describe, expect, it, vi } from 'vitest';
import { GoogleHttpError } from './google';
import {
  PlacesSearchUnavailableError,
  searchPlacesByText,
  TEXT_SEARCH_LIMIT,
  TEXT_SEARCH_MASK,
} from './text-search';

const place = (id: string) => ({
  id,
  displayName: { text: `Name ${id}` },
  formattedAddress: `${id} Road, Bangkok`,
  location: { latitude: 13.75, longitude: 100.5 },
  types: ['restaurant', 'food'],
});

function ok(body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body)));
}

describe('searchPlacesByText', () => {
  it('throws PlacesSearchUnavailableError when the key is unset', async () => {
    await expect(searchPlacesByText('wat arun', {}, { key: '', fetchImpl: ok({}) })).rejects.toBeInstanceOf(
      PlacesSearchUnavailableError,
    );
  });

  it('returns [] for an empty query without calling Google or needing a key', async () => {
    const fetchImpl = ok({});
    expect(await searchPlacesByText('   ', {}, { key: '', fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps the field-mask shape to {placeId,name,lat,lng,address,types}', async () => {
    const fetchImpl = ok({ places: [place('abc')] });
    const r = await searchPlacesByText('wat arun', {}, { key: 'K', fetchImpl });
    expect(r).toEqual([
      { placeId: 'abc', name: 'Name abc', lat: 13.75, lng: 100.5, address: 'abc Road, Bangkok', types: ['restaurant', 'food'] },
    ]);
    const [, init] = fetchImpl.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toBe(TEXT_SEARCH_MASK);
    expect(headers['X-Goog-Api-Key']).toBe('K');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('places:searchText');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ textQuery: 'wat arun', pageSize: TEXT_SEARCH_LIMIT });
    expect(body.locationBias).toBeUndefined();
  });

  it('omits types when Google returns none', async () => {
    const fetchImpl = ok({ places: [{ ...place('abc'), types: [] }] });
    const r = await searchPlacesByText('x', {}, { key: 'K', fetchImpl });
    expect(r[0]).not.toHaveProperty('types');
  });

  it('passes near+radius as a locationBias circle', async () => {
    const fetchImpl = ok({ places: [place('abc')] });
    await searchPlacesByText('cafe', { near: { lat: 18.79, lng: 98.98 }, radius: 2000 }, { key: 'K', fetchImpl });
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.locationBias).toEqual({ circle: { center: { latitude: 18.79, longitude: 98.98 }, radius: 2000 } });
  });

  it('clamps an oversized radius to 50km', async () => {
    const fetchImpl = ok({ places: [place('abc')] });
    await searchPlacesByText('cafe', { near: { lat: 18.79, lng: 98.98 }, radius: 999_999 }, { key: 'K', fetchImpl });
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.locationBias.circle.radius).toBe(50_000);
  });

  it('returns [] when Google finds nothing', async () => {
    expect(await searchPlacesByText('nowhere', {}, { key: 'K', fetchImpl: ok({ places: [] }) })).toEqual([]);
    expect(await searchPlacesByText('nowhere', {}, { key: 'K', fetchImpl: ok({}) })).toEqual([]);
  });

  it('drops results without id or coordinates and caps at TEXT_SEARCH_LIMIT', async () => {
    const places = [
      { displayName: { text: 'no id' }, location: { latitude: 1, longitude: 2 } },
      { id: 'no-loc', displayName: { text: 'no loc' } },
      ...Array.from({ length: 15 }, (_, i) => place(`p${i}`)),
    ];
    const r = await searchPlacesByText('many', {}, { key: 'K', fetchImpl: ok({ places }) });
    expect(r).toHaveLength(TEXT_SEARCH_LIMIT);
    expect(r.every((p) => p.placeId.startsWith('p'))).toBe(true);
  });

  it('throws GoogleHttpError on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('quota', { status: 429 }));
    await expect(searchPlacesByText('x', {}, { key: 'K', fetchImpl })).rejects.toBeInstanceOf(GoogleHttpError);
  });

  it('throws GoogleHttpError(0) on a network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down');
    });
    await expect(searchPlacesByText('x', {}, { key: 'K', fetchImpl })).rejects.toMatchObject({ status: 0 });
  });
});
