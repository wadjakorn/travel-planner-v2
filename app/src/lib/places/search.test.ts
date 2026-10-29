import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readMapsConfig } from '@/lib/maps/config';
import { PLACE } from './__fixtures__/gmaps-links';
import { GoogleHttpError } from './google';
import { __resetGoogleState, getPlaceDetail, getPlacePhotoRef, getPlacePhotoUri, googleBreakerOpen, noteGoogleFailure, searchPlaces, suggestFromLink, withTz } from './search';

const geo = { results: [{ place_id: 'g1', name: 'Wat Arun', lat: 13.7437, lon: 100.4888 }] };
const photon = {
  features: [{ geometry: { coordinates: [100.4888, 13.7437] }, properties: { osm_type: 'W', osm_id: 7, name: 'Wat Arun' } }],
};

function router(handlers: { geoapify?: () => Response; photon?: () => Response }) {
  return vi.fn(async (input: URL | RequestInfo) => {
    const u = String(input);
    if (u.includes('geoapify')) return handlers.geoapify?.() ?? new Response('{}');
    if (u.includes('photon')) return handlers.photon?.() ?? new Response('{}');
    throw new Error(`unexpected ${u}`);
  });
}

describe('searchPlaces', () => {
  it('uses Geoapify and fills timezone from coordinates', async () => {
    const fetchImpl = router({ geoapify: () => new Response(JSON.stringify(geo)) });
    const r = await searchPlaces('Wat Arun', { key: 'K', fetchImpl });
    expect(r[0]).toMatchObject({ id: 'geoapify:g1', timeZone: 'Asia/Bangkok' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('withTz gives timeZone null, without throwing, when lat is null', () => {
    const p = { id: 'google:x', name: 'X', secondary: null, address: null, lat: null, lng: null, kind: 'sight' as const, timeZone: null };
    expect(withTz(p)).toEqual(p);
  });
  it('mixed Thai/Latin query asks Geoapify in Thai', async () => {
    const fetchImpl = router({ geoapify: () => new Response(JSON.stringify(geo)) });
    await searchPlaces('ร้าน Ristr8to', { key: 'K', fetchImpl });
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('lang')).toBe('th');
  });
  it('falls back to Photon on 429', async () => {
    const fetchImpl = router({
      geoapify: () => new Response('quota', { status: 429 }),
      photon: () => new Response(JSON.stringify(photon)),
    });
    const r = await searchPlaces('Wat Arun', { key: 'K', fetchImpl });
    expect(r[0].id).toBe('osm:W7');
  });
  it('falls back to Photon when Geoapify finds nothing', async () => {
    const fetchImpl = router({
      geoapify: () => new Response(JSON.stringify({ results: [] })),
      photon: () => new Response(JSON.stringify(photon)),
    });
    expect((await searchPlaces('Wat Arun', { key: 'K', fetchImpl }))[0].id).toBe('osm:W7');
  });
  it('skips Geoapify without a key', async () => {
    const fetchImpl = router({ photon: () => new Response(JSON.stringify(photon)) });
    await searchPlaces('Wat Arun', { key: '', fetchImpl });
    expect(fetchImpl).toHaveBeenCalled();
    expect(fetchImpl.mock.calls.every((c) => String(c[0]).includes('photon'))).toBe(true);
  });
  it('returns [] when both fail', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('down'); });
    expect(await searchPlaces('x', { key: 'K', fetchImpl })).toEqual([]);
  });
});

describe('getPlaceDetail', () => {
  it('null for non-Geoapify ids without calling out', async () => {
    const fetchImpl = vi.fn();
    expect(await getPlaceDetail('osm:N1', 'en', { key: 'K', fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('strips the prefix and returns null on upstream failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    expect(await getPlaceDetail('geoapify:abc', 'th', { key: 'K', fetchImpl })).toBeNull();
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('id')).toBe('abc');
  });
});

const gcfg = readMapsConfig({
  MAPS_PROVIDER: 'google', GOOGLE_MAPS_API_KEY: 'S', GOOGLE_MAPS_URL_SIGNING_SECRET: 'X',
  GOOGLE_MAPS_BROWSER_KEY: 'B', GOOGLE_MAPS_MAP_ID: 'M',
  GEOAPIFY_API_KEY: 'K', NODE_ENV: 'test',
});
const fakeCfg = readMapsConfig({ MAPS_PROVIDER: 'google', GOOGLE_PLACES_FAKE: '1', GOOGLE_MAPS_BROWSER_KEY: 'B', GOOGLE_MAPS_MAP_ID: 'M', GEOAPIFY_API_KEY: 'K', NODE_ENV: 'test' });
const gAuto = { suggestions: [{ placePrediction: { placeId: 'ChIJabc', structuredFormat: { mainText: { text: 'Jay Fai' } }, types: ['restaurant'] } }] };
const gDet = { id: 'ChIJabc', displayName: { text: 'Jay Fai' }, formattedAddress: 'Bangkok', location: { latitude: 13.75, longitude: 100.5 }, types: ['restaurant'] };
const T0 = 1_000_000;
const okConsume = () => vi.fn(async () => ({ ok: true as const }));

type H = { google?: () => Response | Promise<Response>; geoapify?: () => Response; photon?: () => Response };
function grouter(h: H) {
  return vi.fn<typeof fetch>(async (input) => {
    const u = String(input);
    if (u.includes('googleapis')) { if (!h.google) throw new Error('unexpected google'); return h.google(); }
    if (u.includes('geoapify')) return h.geoapify?.() ?? new Response('{}');
    if (u.includes('photon')) return h.photon?.() ?? new Response('{}');
    throw new Error(`unexpected ${u}`);
  });
}
const geoOk = () => new Response(JSON.stringify(geo));
const gOk = () => new Response(JSON.stringify(gAuto));
const googleCalls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => String(c[0]).includes('googleapis')).length;
const geoCalls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => String(c[0]).includes('geoapify')).length;

describe('Google-first search', () => {
  beforeEach(() => __resetGoogleState());

  it('open (default) config never calls Google', async () => {
    const fetchImpl = grouter({ google: gOk, geoapify: geoOk });
    await searchPlaces('x', { key: 'K', fetchImpl });
    expect(googleCalls(fetchImpl)).toBe(0);
  });
  it('google first, Geoapify untouched', async () => {
    const fetchImpl = grouter({ google: gOk, geoapify: geoOk });
    const r = await searchPlaces('jay fai', { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 });
    expect(r[0].id).toBe('ChIJabc');
    expect(geoCalls(fetchImpl)).toBe(0);
  });
  it('threads a bias to Google autocomplete', async () => {
    const fetchImpl = grouter({ google: gOk });
    await searchPlaces('Lawson', { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0, bias: { kind: 'point', lat: 35.69, lng: 139.7, radius: 10_000 } });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).locationBias).toEqual({ circle: { center: { latitude: 35.69, longitude: 139.7 }, radius: 10_000 } });
  });
  it('threads a bias through both fallback providers', async () => {
    const fetchImpl = grouter({ google: () => new Response('{"suggestions":[]}'), geoapify: () => new Response('', { status: 503 }), photon: () => new Response(JSON.stringify(photon)) });
    await searchPlaces('Lawson', { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0, bias: { kind: 'point', lat: 35.69, lng: 139.7, radius: 10_000 } });
    const geoUrl = new URL(String(fetchImpl.mock.calls.find(([url]) => String(url).includes('geoapify'))![0]));
    const photonUrl = new URL(String(fetchImpl.mock.calls.find(([url]) => String(url).includes('photon'))![0]));
    expect(geoUrl.searchParams.get('bias')).toBe('circle:139.7,35.69,10000|countrycode:none');
    expect(photonUrl.searchParams.get('lat')).toBe('35.69');
    expect(photonUrl.searchParams.get('lon')).toBe('139.7');
  });
  it('forwards origin to Google only', async () => {
    const origin = { lat: 35.658, lng: 139.702 };
    const g = grouter({ google: gOk });
    await searchPlaces('ramen', { config: gcfg, fetchImpl: g, consume: okConsume(), now: () => T0, origin });
    expect(JSON.parse(String(g.mock.calls[0][1]?.body)).origin).toEqual({ latitude: 35.658, longitude: 139.702 });
    const f = grouter({ google: () => new Response('{"suggestions":[]}'), geoapify: () => new Response('', { status: 503 }), photon: () => new Response(JSON.stringify(photon)) });
    await searchPlaces('ramen', { config: gcfg, fetchImpl: f, consume: okConsume(), now: () => T0, origin });
    const urls = f.mock.calls.map(([url]) => String(url)).filter((u) => !u.includes('googleapis'));
    expect(urls.length).toBe(2);
    for (const u of urls) expect(u).not.toContain('origin');
  });
  it('sends the query language to Google', async () => {
    const fetchImpl = grouter({ google: gOk });
    const run = (q: string) => searchPlaces(q, { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 });
    await run('ร้านเจ๊ไฝ');
    await run('jay fai');
    const lang = (i: number) => JSON.parse(String(fetchImpl.mock.calls[i][1]?.body)).languageCode;
    expect([lang(0), lang(1)]).toEqual(['th', 'en']);
  });
  it('empty Google result falls to Geoapify', async () => {
    const fetchImpl = grouter({ google: () => new Response('{"suggestions":[]}'), geoapify: geoOk });
    const r = await searchPlaces('x', { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 });
    expect(r[0].id).toBe('geoapify:g1');
  });
  it('403 trips the breaker for 10 minutes', async () => {
    const fetchImpl = grouter({ google: () => new Response('', { status: 403 }), geoapify: geoOk });
    let t = T0;
    const deps = { config: gcfg, fetchImpl, consume: okConsume(), now: () => t };
    expect((await searchPlaces('x', deps))[0].id).toBe('geoapify:g1');
    expect(googleCalls(fetchImpl)).toBe(1);
    t = T0 + 9 * 60_000;
    await searchPlaces('x', deps);
    expect(googleCalls(fetchImpl)).toBe(1);
    t = T0 + 10 * 60_000;
    await searchPlaces('x', deps);
    expect(googleCalls(fetchImpl)).toBe(2);
  });
  it('a timeout trips the breaker', async () => {
    const fetchImpl = grouter({ google: () => { throw new Error('timeout'); }, geoapify: geoOk });
    const deps = { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 };
    expect((await searchPlaces('x', deps))[0].id).toBe('geoapify:g1');
    await searchPlaces('x', deps);
    expect(googleCalls(fetchImpl)).toBe(1);
  });
  it('warns once per breaker transition, never while open, no secrets', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    noteGoogleFailure(new GoogleHttpError(403), T0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('403');
    noteGoogleFailure(new GoogleHttpError(429), T0 + 1000);
    expect(warn).toHaveBeenCalledTimes(1);
    noteGoogleFailure(new GoogleHttpError(500), T0 + 2000);
    expect(warn).toHaveBeenCalledTimes(1);
    noteGoogleFailure(new GoogleHttpError(403), T0 + 600_000 + 1000); // re-opened after expiry
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  it('warns once when the details budget latches, naming the bucket', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = grouter({ google: gOk, geoapify: geoOk });
    const consume = vi.fn(async (key: string) =>
      key.startsWith('gplaces:details') ? { ok: false as const, retryAfter: 3600, limit: 30 } : { ok: true as const });
    let t = T0;
    const deps = { config: gcfg, fetchImpl, consume, now: () => t };
    await getPlaceDetail('ChIJabc', 'en', { ...deps, fields: 'full' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('gplaces:details:full');
    t = T0 + 1000;
    await getPlaceDetail('ChIJabc', 'en', { ...deps, fields: 'full' }); // short-circuits while latched
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it('noteGoogleFailure: only 0/403/429 trip, and says so', () => {
    expect(noteGoogleFailure(new GoogleHttpError(500), T0)).toBe(false);
    expect(noteGoogleFailure(new GoogleHttpError(404), T0)).toBe(false);
    expect(googleBreakerOpen(T0)).toBe(false);
    expect(noteGoogleFailure(new GoogleHttpError(429), T0)).toBe(true);
    expect(googleBreakerOpen(T0 + 599_999)).toBe(true);
    expect(googleBreakerOpen(T0 + 600_000)).toBe(false);
  });
  it.each([0, 403, 429])('noteGoogleFailure returns true for status %i', (s) => {
    expect(noteGoogleFailure(new GoogleHttpError(s), T0)).toBe(true);
  });
  it('noteGoogleFailure counts a non-HTTP error as status 0', () => {
    expect(noteGoogleFailure(new Error('x'), T0)).toBe(true);
  });
  it('a trip noted via the export stops searchPlaces (shared state)', async () => {
    const fetchImpl = grouter({ google: gOk, geoapify: geoOk });
    noteGoogleFailure(new GoogleHttpError(403), T0);
    await searchPlaces('jay fai', { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 + 60_000 });
    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes('places.googleapis.com'))).toBe(false);
  });
  it('details denial stops google autocomplete until retryAfter', async () => {
    const fetchImpl = grouter({ google: gOk, geoapify: geoOk });
    const consume = vi.fn(async (key: string) =>
      key === 'gplaces:details:full' ? { ok: false as const, retryAfter: 3600, limit: 30 } : { ok: true as const });
    let t = T0;
    const deps = { config: gcfg, fetchImpl, consume, now: () => t };
    expect(await getPlaceDetail('ChIJabc', 'en', { ...deps, fields: 'full' })).toBeNull();
    expect(consume).toHaveBeenCalledWith('gplaces:details:full', 30, 86400);
    t = T0 + 60_000;
    consume.mockClear();
    await searchPlaces('x', deps);
    expect(googleCalls(fetchImpl)).toBe(0);
    expect(consume).not.toHaveBeenCalled();
    t = T0 + 3600_000;
    await searchPlaces('x', deps);
    expect(googleCalls(fetchImpl)).toBe(1);
  });
  it('consumes the autocomplete budget once; denial skips the fetch', async () => {
    const fetchImpl = grouter({ google: gOk, geoapify: geoOk });
    const consume = okConsume();
    await searchPlaces('x', { config: gcfg, fetchImpl, consume, now: () => T0 });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith('gplaces:autocomplete', 300, 86400);
    const deny = vi.fn(async () => ({ ok: false as const, retryAfter: 5, limit: 300 }));
    const f2 = grouter({ google: gOk, geoapify: geoOk });
    const r = await searchPlaces('x', { config: gcfg, fetchImpl: f2, consume: deny, now: () => T0 });
    expect(googleCalls(f2)).toBe(0);
    expect(r[0].id).toBe('geoapify:g1');
  });
  it('fake mode never consumes and serves fixtures', async () => {
    const fetchImpl = grouter({});
    const consume = okConsume();
    const deps = { config: fakeCfg, fetchImpl, consume, now: () => T0 };
    const r = await searchPlaces('jay fai', deps);
    expect(r[0].id).toBe('ChIJaxq89xaZ4jARQtKhE1uqq9c');
    const d = await getPlaceDetail('ChIJaxq89xaZ4jARQtKhE1uqq9c', 'en', { ...deps, fields: 'full' });
    expect(d).not.toBeNull();
    expect(consume).not.toHaveBeenCalled();
    expect(googleCalls(fetchImpl)).toBe(0);
  });
  it('the limiter failing open still calls Google', async () => {
    const fetchImpl = grouter({ google: gOk });
    const consume = vi.fn(async () => { throw new Error('db down'); });
    const r = await searchPlaces('x', { config: gcfg, fetchImpl, consume, now: () => T0 });
    expect(r[0].id).toBe('ChIJabc');
  });
  it.each([
    ['403', () => new Response('', { status: 403 })],
    ['timeout', () => { throw new Error('timeout'); }],
  ])('a details %s trips the breaker', async (_n, google) => {
    const fetchImpl = grouter({ google, geoapify: geoOk });
    const deps = { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 };
    expect(await getPlaceDetail('ChIJabc', 'en', deps)).toBeNull();
    await searchPlaces('x', deps);
    expect(googleCalls(fetchImpl)).toBe(1);
  });
});

describe('getPlaceDetail (google ids)', () => {
  beforeEach(() => __resetGoogleState());

  it('consumes the basic bucket once, requests basic, applies timezone', async () => {
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = okConsume();
    const d = await getPlaceDetail('ChIJabc', 'en', { config: gcfg, fetchImpl, consume, now: () => T0 });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith('gplaces:details:basic', 80, 86400);
    expect(d).toMatchObject({ timeZone: 'Asia/Bangkok', lat: 13.75 });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('id,formattedAddress,location,types');
  });
  it('invalid id: null, no consume, no fetch', async () => {
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = okConsume();
    expect(await getPlaceDetail('a/b', 'en', { config: gcfg, fetchImpl, consume, now: () => T0 })).toBeNull();
    expect(consume).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('open breaker: null, no consume', async () => {
    noteGoogleFailure(new GoogleHttpError(403), T0);
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = okConsume();
    expect(await getPlaceDetail('ChIJabc', 'en', { config: gcfg, fetchImpl, consume, now: () => T0 + 1 })).toBeNull();
    expect(consume).not.toHaveBeenCalled();
  });
  it('bare id under the open config: null, no fetch', async () => {
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    expect(await getPlaceDetail('ChIJabc', 'en', { key: 'K', fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('preview consumes its own bucket with the preview cap', async () => {
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = okConsume();
    await getPlaceDetail('ChIJabc', 'en', { config: gcfg, fetchImpl, consume, now: () => T0, fields: 'preview' });
    expect(consume).toHaveBeenCalledWith('gplaces:details:preview', 150, 86400);
  });
  it('denied preview budget: null, and does NOT latch Google off for other details calls', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = vi.fn(async (key: string) =>
      key === 'gplaces:details:preview' ? { ok: false as const, retryAfter: 3600, limit: 150 } : { ok: true as const });
    const deps = { config: gcfg, fetchImpl, consume, now: () => T0 };
    expect(await getPlaceDetail('ChIJabc', 'en', { ...deps, fields: 'preview' })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await getPlaceDetail('ChIJabc', 'en', { ...deps, fields: 'basic' })).toMatchObject({ lat: 13.75 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('poi consumes its own bucket with the poi cap and asks for the poi mask (name + photo)', async () => {
    const det = { ...gDet, photos: [{ name: 'places/ChIJabc/photos/P1', authorAttributions: [{ displayName: 'Ann', uri: 'https://a' }] }] };
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(det)) });
    const consume = okConsume();
    const d = await getPlaceDetail('ChIJabc', 'en', { config: gcfg, fetchImpl, consume, now: () => T0, fields: 'poi' });
    expect(consume).toHaveBeenCalledWith('gplaces:details:poi', 100, 86400);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('id,displayName,formattedAddress,location,types,photos');
    expect(d).toMatchObject({ name: 'Jay Fai', photo: { name: 'places/ChIJabc/photos/P1' } });
  });
  it('denied poi budget: null, and does NOT latch Google off for other details calls', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = vi.fn(async (key: string) =>
      key === 'gplaces:details:poi' ? { ok: false as const, retryAfter: 3600, limit: 100 } : { ok: true as const });
    const deps = { config: gcfg, fetchImpl, consume, now: () => T0 };
    expect(await getPlaceDetail('ChIJabc', 'en', { ...deps, fields: 'poi' })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await getPlaceDetail('ChIJabc', 'en', { ...deps, fields: 'basic' })).toMatchObject({ lat: 13.75 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('denied details budget: null, no fetch', async () => {
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = vi.fn(async () => ({ ok: false as const, retryAfter: 60, limit: 80 }));
    expect(await getPlaceDetail('ChIJabc', 'en', { config: gcfg, fetchImpl, consume, now: () => T0 })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('suggestFromLink', () => {
  it('turns a pinned link into one gcid suggestion without any fetch', async () => {
    const fetchImpl = vi.fn();
    const r = await suggestFromLink(PLACE, { key: '', fetchImpl });
    expect(r).toEqual({
      results: [expect.objectContaining({
        id: 'gcid:8015311305313251184', name: 'Jay Fai', secondary: null, address: null, kind: 'sight',
      })],
      linkError: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('searches by the link text when there is no pin', async () => {
    const fetchImpl = router({ photon: () => new Response(JSON.stringify(photon)) });
    const r = await suggestFromLink('https://www.google.com/maps/search/?api=1&query=Jay%20Fai', { key: '', fetchImpl });
    expect(r.linkError).toBeNull();
    expect(r.results[0].id).toBe('osm:W7');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('q=Jay+Fai');
  });
  it('forwards bias when searching a link query without coordinates', async () => {
    const fetchImpl = router({ geoapify: () => new Response(JSON.stringify(geo)) });
    await suggestFromLink('https://www.google.com/maps/search/?api=1&query=Jay%20Fai', { key: 'K', fetchImpl, bias: { kind: 'point', lat: 35.69, lng: 139.7, radius: 10_000 } });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get('bias')).toBe('circle:139.7,35.69,10000|countrycode:none');
  });
  it('reports unresolved when the link carries nothing usable', async () => {
    const fetchImpl = vi.fn();
    expect(await suggestFromLink('https://maps.google.com/?cid=1', { key: '', fetchImpl }))
      .toEqual({ results: [], linkError: 'unresolved' });
  });
  const PID = 'https://www.google.com/maps/search/?api=1&query=Jay%20Fai&query_place_id=ChIJabc';
  it('google mode: a query_place_id link becomes one Google suggestion, no fetch', async () => {
    const fetchImpl = grouter({});
    const r = await suggestFromLink(PID, { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 });
    expect(r).toEqual({ results: [expect.objectContaining({ id: 'ChIJabc', name: 'Jay Fai', lat: null, lng: null })], linkError: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('open mode: a query_place_id link still searches by its text', async () => {
    const fetchImpl = router({ photon: () => new Response(JSON.stringify(photon)) });
    const r = await suggestFromLink(PID, { key: '', fetchImpl });
    expect(r.results[0].id).toBe('osm:W7');
  });
});

describe('skipGoogle', () => {
  beforeEach(() => __resetGoogleState());
  it('google mode with skipGoogle goes straight to Geoapify', async () => {
    const fetchImpl = grouter({ google: gOk, geoapify: geoOk });
    const consume = okConsume();
    const r = await searchPlaces('x', { config: gcfg, fetchImpl, consume, now: () => T0, skipGoogle: true });
    expect(r[0].id).toBe('geoapify:g1');
    expect(googleCalls(fetchImpl)).toBe(0);
    expect(consume).not.toHaveBeenCalled();
  });
});

describe('getPlacePhotoUri', () => {
  beforeEach(() => __resetGoogleState());
  const NAME = 'places/ChIJabc/photos/AbC';
  const media = () => new Response(JSON.stringify({ photoUri: 'https://lh3.googleusercontent.com/p/x' }));

  it('consumes the photo bucket and returns the photoUri', async () => {
    const fetchImpl = grouter({ google: media });
    const consume = okConsume();
    expect(await getPlacePhotoUri(NAME, { config: gcfg, fetchImpl, consume, now: () => T0 })).toBe('https://lh3.googleusercontent.com/p/x');
    expect(consume).toHaveBeenCalledWith('gplaces:photo', 100, 86400);
  });
  it('denied photo budget: null, no fetch, and details still reach Google (no latch)', async () => {
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = vi.fn(async (key: string) =>
      key === 'gplaces:photo' ? { ok: false as const, retryAfter: 3600, limit: 30 } : { ok: true as const });
    const deps = { config: gcfg, fetchImpl, consume, now: () => T0 };
    expect(await getPlacePhotoUri(NAME, deps)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await getPlaceDetail('ChIJabc', 'en', deps)).toMatchObject({ lat: 13.75 });
  });
  it('open config, fake mode, invalid name or open breaker: null, no consume', async () => {
    const fetchImpl = grouter({ google: media });
    const consume = okConsume();
    expect(await getPlacePhotoUri(NAME, { key: 'K', fetchImpl, consume })).toBeNull();
    expect(await getPlacePhotoUri(NAME, { config: fakeCfg, fetchImpl, consume, now: () => T0 })).toBeNull();
    expect(await getPlacePhotoUri('../x', { config: gcfg, fetchImpl, consume, now: () => T0 })).toBeNull();
    noteGoogleFailure(new GoogleHttpError(403), T0);
    expect(await getPlacePhotoUri(NAME, { config: gcfg, fetchImpl, consume, now: () => T0 + 1 })).toBeNull();
    expect(consume).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('a photo timeout / network error does not open the breaker (optional image must not block search)', async () => {
    const fetchImpl = grouter({ google: () => { throw new Error('timeout'); } });
    expect(await getPlacePhotoUri(NAME, { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 })).toBeNull();
    expect(googleBreakerOpen(T0 + 1)).toBe(false);
  });
  it('upstream failure: null and notes the failure (breaker)', async () => {
    const fetchImpl = grouter({ google: () => new Response('', { status: 403 }) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getPlacePhotoUri(NAME, { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 })).toBeNull();
    expect(googleBreakerOpen(T0 + 1)).toBe(true);
    warn.mockRestore();
  });
});

describe('getPlacePhotoRef', () => {
  beforeEach(() => __resetGoogleState());
  const refBody = () => new Response(JSON.stringify({ id: 'ChIJabc', photos: [{ name: 'places/ChIJabc/photos/P', authorAttributions: [] }] }));

  it('consumes its own bucket and returns the first photo', async () => {
    const fetchImpl = grouter({ google: refBody });
    const consume = okConsume();
    expect(await getPlacePhotoRef('ChIJabc', { config: gcfg, fetchImpl, consume, now: () => T0 })).toEqual({ photo: { name: 'places/ChIJabc/photos/P', attributions: [] } });
    expect(consume).toHaveBeenCalledWith('gplaces:details:photo', 500, 86400);
  });
  it('a place with no photos is a definite answer, not "unavailable"', async () => {
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify({ id: 'ChIJabc' })) });
    expect(await getPlacePhotoRef('ChIJabc', { config: gcfg, fetchImpl, consume: okConsume(), now: () => T0 })).toEqual({ photo: null });
  });
  it('denied budget: null, no fetch, Google not latched off', async () => {
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = vi.fn(async (key: string) =>
      key === 'gplaces:details:photo' ? { ok: false as const, retryAfter: 3600, limit: 500 } : { ok: true as const });
    const deps = { config: gcfg, fetchImpl, consume, now: () => T0 };
    expect(await getPlacePhotoRef('ChIJabc', deps)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await getPlaceDetail('ChIJabc', 'en', deps)).toMatchObject({ lat: 13.75 });
  });
  it('non-Google ids, open config, fake mode or open breaker: null, no consume', async () => {
    const fetchImpl = grouter({ google: refBody });
    const consume = okConsume();
    for (const id of ['gcid:123', 'geoapify:x', 'osm:N1', '']) {
      expect(await getPlacePhotoRef(id, { config: gcfg, fetchImpl, consume, now: () => T0 })).toBeNull();
    }
    expect(await getPlacePhotoRef('ChIJabc', { key: 'K', fetchImpl, consume })).toBeNull();
    expect(await getPlacePhotoRef('ChIJabc', { config: fakeCfg, fetchImpl, consume, now: () => T0 })).toBeNull();
    noteGoogleFailure(new GoogleHttpError(403), T0);
    expect(await getPlacePhotoRef('ChIJabc', { config: gcfg, fetchImpl, consume, now: () => T0 + 1 })).toBeNull();
    expect(consume).not.toHaveBeenCalled();
  });
  it('a timeout does not open the breaker; a 403 does', async () => {
    const slow = grouter({ google: () => { throw new Error('timeout'); } });
    expect(await getPlacePhotoRef('ChIJabc', { config: gcfg, fetchImpl: slow, consume: okConsume(), now: () => T0 })).toBeNull();
    expect(googleBreakerOpen(T0 + 1)).toBe(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const denied = grouter({ google: () => new Response('', { status: 403 }) });
    expect(await getPlacePhotoRef('ChIJabc', { config: gcfg, fetchImpl: denied, consume: okConsume(), now: () => T0 })).toBeNull();
    expect(googleBreakerOpen(T0 + 1)).toBe(true);
    warn.mockRestore();
  });
});
