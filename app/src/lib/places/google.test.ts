import { describe, expect, it, vi } from 'vitest';
import autocompleteFx from './__fixtures__/google-autocomplete.json';
import detailsFx from './__fixtures__/google-details-full.json';
import { fakeGoogleFetch } from './google-fake';
import {
  GOOGLE_BIAS,
  GOOGLE_MASKS,
  GoogleHttpError,
  googleAutocomplete,
  googleDetails,
  isValidGoogleId,
} from './google';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const mk = (body: unknown) => vi.fn(async () => ok(body)) as unknown as ReturnType<typeof vi.fn> & typeof fetch;

describe('googleAutocomplete', () => {
  it('POSTs the documented request and maps placePredictions only', async () => {
    const f = mk(autocompleteFx);
    const out = await googleAutocomplete('jay fai', { key: 'K', lang: 'th', session: 'S', fetchImpl: f });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('K');
    expect(JSON.parse(init.body as string)).toEqual({
      input: 'jay fai',
      languageCode: 'th',
      sessionToken: 'S',
      locationBias: { circle: { center: { latitude: 13.75, longitude: 100.5 }, radius: 50000 } },
    });
    expect(GOOGLE_BIAS).toEqual({ lat: 13.75, lng: 100.5, radius: 50000 });
    expect(out).toEqual([
      { id: 'ChIJfakeJayFai0001', name: 'Jay Fai', secondary: 'Maha Chai Rd, Bangkok', address: null, lat: null, lng: null, kind: 'food', timeZone: null },
    ]);
  });
  it('omits sessionToken when session is null', async () => {
    const f = mk(autocompleteFx);
    await googleAutocomplete('x', { key: 'K', lang: 'en', session: null, fetchImpl: f });
    const init = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect('sessionToken' in JSON.parse(init.body as string)).toBe(false);
  });
});

describe('googleDetails', () => {
  it('basic: GETs with the fixed mask and nulls the Pro fields', async () => {
    const f = mk(detailsFx);
    const out = await googleDetails('ChIJabc', { key: 'K', lang: 'en', session: 'S', fields: 'basic', fetchImpl: f });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJabc?languageCode=en&sessionToken=S');
    expect(init.cache).toBe('no-store');
    const h = init.headers as Record<string, string>;
    expect(h['X-Goog-FieldMask']).toBe(GOOGLE_MASKS.basic);
    expect(h['X-Goog-Api-Key']).toBe('K');
    expect(out).toMatchObject({ lat: 13.7524, lng: 100.5045, phone: null, website: null, hours: null, rating: null, reviews: null });
  });
  it('full: maps phone, website, hours, rating, reviews', async () => {
    const f = mk(detailsFx);
    const out = await googleDetails('ChIJabc', { key: 'K', lang: 'en', session: null, fields: 'full', fetchImpl: f });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJabc?languageCode=en');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(GOOGLE_MASKS.full);
    expect(out?.name).toBe('Jay Fai');
    expect(out?.hours).toBe(detailsFx.regularOpeningHours.weekdayDescriptions.join('; '));
    expect(out).toMatchObject({ rating: 4.4, reviews: 1234, phone: '02 223 9384', website: 'https://example.com/jayfai', kind: 'food' });
  });
  it('masks are fixed', () => {
    expect(GOOGLE_MASKS.basic).toBe('id,formattedAddress,location,types');
    expect(GOOGLE_MASKS.full).toBe(
      'id,displayName,formattedAddress,location,types,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount',
    );
  });
  it('a basic response without displayName has name ""', async () => {
    const f = mk({ id: 'x', formattedAddress: 'A', location: { latitude: 1, longitude: 2 }, types: [] });
    const out = await googleDetails('x', { key: 'K', lang: 'en', session: null, fields: 'basic', fetchImpl: f });
    expect(out?.name).toBe('');
  });
  it.each(['../x', 'a/b', 'a?b', '', 'a'.repeat(257)])('rejects id %j without fetching', async (id) => {
    const f = mk(detailsFx);
    expect(isValidGoogleId(id)).toBe(false);
    expect(await googleDetails(id, { key: 'K', lang: 'en', session: null, fields: 'basic', fetchImpl: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('accepts a 256-char id', () => {
    expect(isValidGoogleId('a'.repeat(256))).toBe(true);
  });
  it('returns null when location is missing', async () => {
    const f = mk({ id: 'x', formattedAddress: 'A' });
    expect(await googleDetails('x', { key: 'K', lang: 'en', session: null, fields: 'basic', fetchImpl: f })).toBeNull();
  });
});

describe('errors', () => {
  it('403 → GoogleHttpError(403)', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    const p = googleAutocomplete('x', { key: 'K', lang: 'en', session: null, fetchImpl: f });
    await expect(p).rejects.toBeInstanceOf(GoogleHttpError);
    await expect(p).rejects.toMatchObject({ status: 403 });
  });
  it('network error → status 0', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(googleDetails('x', { key: 'K', lang: 'en', session: null, fields: 'basic', fetchImpl: f })).rejects.toMatchObject({ name: 'GoogleHttpError', status: 0 });
  });
  it('real timeout → GoogleHttpError status 0', async () => {
    const f = ((_u: unknown, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      })) as unknown as typeof fetch;
    const p = googleAutocomplete('x', { key: 'K', lang: 'en', session: null, fetchImpl: f, timeoutMs: 1 });
    await expect(p).rejects.toBeInstanceOf(GoogleHttpError);
    await expect(p).rejects.toMatchObject({ status: 0 });
  });
});

describe('fakeGoogleFetch', () => {
  it('serves fixtures and 404s elsewhere', async () => {
    const f = fakeGoogleFetch();
    const out = await googleAutocomplete('x', { key: 'K', lang: 'en', session: null, fetchImpl: f });
    expect(out).toHaveLength(1);
    const d = await googleDetails('ChIJabc', { key: 'K', lang: 'en', session: null, fields: 'full', fetchImpl: f });
    expect(d?.name).toBe('Jay Fai');
    expect((await f('https://places.googleapis.com/v2/nope')).status).toBe(404);
  });
});
