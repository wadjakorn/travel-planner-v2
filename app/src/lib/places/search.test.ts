import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readMapsConfig } from '@/lib/maps/config';
import { GoogleHttpError } from './google';
import { __resetGoogleState, getPlaceDetail, googleBreakerOpen, noteGoogleFailure, searchPlaces, withTz } from './search';

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
  GEOAPIFY_API_KEY: 'K', NODE_ENV: 'test',
});
const fakeCfg = readMapsConfig({ MAPS_PROVIDER: 'google', GOOGLE_PLACES_FAKE: '1', GEOAPIFY_API_KEY: 'K', NODE_ENV: 'test' });
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
  it('noteGoogleFailure: only 0/403/429 trip', () => {
    noteGoogleFailure(new GoogleHttpError(500), T0);
    expect(googleBreakerOpen(T0)).toBe(false);
    noteGoogleFailure(new GoogleHttpError(429), T0);
    expect(googleBreakerOpen(T0 + 599_999)).toBe(true);
    expect(googleBreakerOpen(T0 + 600_000)).toBe(false);
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
    expect(r[0].id).toBe('ChIJfakeJayFai0001');
    const d = await getPlaceDetail('ChIJfakeJayFai0001', 'en', { ...deps, fields: 'full' });
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
  it('denied details budget: null, no fetch', async () => {
    const fetchImpl = grouter({ google: () => new Response(JSON.stringify(gDet)) });
    const consume = vi.fn(async () => ({ ok: false as const, retryAfter: 60, limit: 80 }));
    expect(await getPlaceDetail('ChIJabc', 'en', { config: gcfg, fetchImpl, consume, now: () => T0 })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
