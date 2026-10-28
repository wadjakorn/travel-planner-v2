import { describe, expect, it, vi } from 'vitest';
import autocompleteFx from './__fixtures__/google-autocomplete.json';
import basicFx from './__fixtures__/google-details-basic.json';
import refreshFx from './__fixtures__/google-details-refresh.json';
import detailsFx from './__fixtures__/google-details-full.json';
import { fakeGoogleFetch } from './google-fake';
import {
  GOOGLE_BIAS,
  GOOGLE_MASKS,
  GOOGLE_REFRESH_MASK,
  GoogleHttpError,
  googleAutocomplete,
  googleDetails,
  googlePhotoUri,
  isValidPhotoName,
  googleRefreshDetails,
  isValidGoogleId,
} from './google';

// Live-captured ids (google-autocomplete.json suggestions[0] / [1]).
const P0 = 'ChIJaxq89xaZ4jARQtKhE1uqq9c';
const P1 = 'ChIJxz6G-dIOPDERN-quVb-KRik';

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
      { id: P0, name: 'Jay Fai', secondary: 'Maha Chai Road, Samran Rat, Phra Nakhon, Bangkok, Thailand', address: null, lat: null, lng: null, kind: 'food', timeZone: null },
      { id: P1, name: 'Jay Fai Saab', secondary: 'ถนนธานี Nai Mueang, Mueang Nakhon Phanom District, Nakhon Phanom, Thailand', address: null, lat: null, lng: null, kind: 'food', timeZone: null },
      { id: 'ChIJ1-skMpG9eUgR5EU4ETA2K38', name: 'Jayfair Recruitment Solutions Limited', secondary: 'Mansfield, UK', address: null, lat: null, lng: null, kind: 'sight', timeZone: null },
      { id: 'ChIJFw0nVtJP4DsREqTLlOOrUh0', name: 'Jay Somjai Fashion', secondary: 'Vegetable Market, Harinagar-2, Harinagar, Udhana, Surat, Gujarat, India', address: null, lat: null, lng: null, kind: 'sight', timeZone: null },
      { id: 'ChIJswPoJfqZhYARDd-FyV0QhJw', name: 'Fairborn Jay F MD', secondary: '3rd Street, San Rafael, CA, USA', address: null, lat: null, lng: null, kind: 'sight', timeZone: null },
    ]);
  });
  it('drops queryPredictions (SYNTHETIC entry appended to the live fixture)', async () => {
    // Live capture has no queryPrediction; this one is hand-made to keep that branch covered.
    const withQuery = { suggestions: [...autocompleteFx.suggestions, { queryPrediction: { text: { text: 'jay fai near me' } } }] };
    const out = await googleAutocomplete('jay fai', { key: 'K', lang: 'en', session: null, fetchImpl: mk(withQuery) });
    expect(out).toHaveLength(5);
    expect(out.map((p) => p.id)).toEqual(autocompleteFx.suggestions.map((x) => x.placePrediction.placeId));
  });
  it('omits sessionToken when session is null', async () => {
    const f = mk(autocompleteFx);
    await googleAutocomplete('x', { key: 'K', lang: 'en', session: null, fetchImpl: f });
    const init = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect('sessionToken' in JSON.parse(init.body as string)).toBe(false);
  });
  it('uses a supplied proximity bias', async () => {
    const f = mk(autocompleteFx);
    await googleAutocomplete('x', {
      key: 'K', lang: 'en', session: null, fetchImpl: f,
      bias: { kind: 'point', lat: 35.69, lng: 139.7, radius: 10_000 },
    });
    const init = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).locationBias).toEqual({
      circle: { center: { latitude: 35.69, longitude: 139.7 }, radius: 10_000 },
    });
  });
});

describe('googleDetails', () => {
  it('basic: GETs with the fixed mask; parser nulls Pro/Enterprise fields even when the response (full fixture) carries them', async () => {
    const f = mk(detailsFx);
    const out = await googleDetails(P0, { key: 'K', lang: 'en', session: 'S', fields: 'basic', fetchImpl: f });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://places.googleapis.com/v1/places/${P0}?languageCode=en&sessionToken=S`);
    expect(init.cache).toBe('no-store');
    const h = init.headers as Record<string, string>;
    expect(h['X-Goog-FieldMask']).toBe(GOOGLE_MASKS.basic);
    expect(h['X-Goog-Api-Key']).toBe('K');
    expect(out).toMatchObject({ lat: 13.7525912, lng: 100.50481889999999, phone: null, website: null, hours: null, rating: null, reviews: null });
  });
  it('parses the live basic details', async () => {
    const out = await googleDetails(P0, { key: 'K', lang: 'en', session: 'S', fields: 'basic', fetchImpl: mk(basicFx) });
    expect(out).toMatchObject({
      name: '',
      address: '327 Maha Chai Rd, Khwaeng Samran Rat, Khet Phra Nakhon, Krung Thep Maha Nakhon 10200, Thailand',
      lat: 13.7525912,
      lng: 100.50481889999999,
      phone: null,
      rating: null,
    });
  });
  it('full: maps phone, website, hours, rating, reviews', async () => {
    const f = mk(detailsFx);
    const out = await googleDetails(P0, { key: 'K', lang: 'en', session: null, fields: 'full', fetchImpl: f });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://places.googleapis.com/v1/places/${P0}?languageCode=en`);
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe(GOOGLE_MASKS.full);
    expect(out?.name).toBe('Raan Jay Fai');
    expect(out?.hours).toBe(detailsFx.regularOpeningHours.weekdayDescriptions.join('; '));
    expect(out).toMatchObject({ rating: 3.6, reviews: 5117, phone: '02 223 9384', website: 'https://www.instagram.com/jayfaibangkok', kind: 'food' });
  });
  it('preview: sends the preview mask (basic + photos) and maps the first photo with its attributions', async () => {
    const f = mk({
      ...basicFx,
      photos: [
        { name: `places/${P0}/photos/AbC_1`, authorAttributions: [{ displayName: 'Somchai', uri: 'https://maps.google.com/maps/contrib/1' }] },
        { name: `places/${P0}/photos/AbC_2`, authorAttributions: [] },
      ],
    });
    const out = await googleDetails(P0, { key: 'K', lang: 'en', session: null, fields: 'preview', fetchImpl: f });
    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('id,formattedAddress,location,types,photos');
    expect(out?.photo).toEqual({
      name: `places/${P0}/photos/AbC_1`,
      attributions: [{ name: 'Somchai', uri: 'https://maps.google.com/maps/contrib/1' }],
    });
    expect(out).toMatchObject({ phone: null, rating: null });
  });
  it('preview without photos: photo is null; basic/full never carry a photo', async () => {
    const pv = await googleDetails(P0, { key: 'K', lang: 'en', session: null, fields: 'preview', fetchImpl: mk(basicFx) });
    expect(pv?.photo).toBeNull();
    const withPhotos = { ...detailsFx, photos: [{ name: `places/${P0}/photos/X`, authorAttributions: [] }] };
    const b = await googleDetails(P0, { key: 'K', lang: 'en', session: null, fields: 'basic', fetchImpl: mk(withPhotos) });
    const fu = await googleDetails(P0, { key: 'K', lang: 'en', session: null, fields: 'full', fetchImpl: mk(withPhotos) });
    expect(b && 'photo' in b).toBe(false);
    expect(fu && 'photo' in fu).toBe(false);
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

describe('googleRefreshDetails', () => {
  const fx = refreshFx;
  const omit = (k: string): Record<string, unknown> => {
    const c: Record<string, unknown> = { ...fx };
    delete c[k];
    return c;
  };
  const o = (f: typeof fetch) => ({ key: 'K', lang: 'th' as const, fetchImpl: f });
  it('mask is Enterprise-only: full minus types plus businessStatus', () => {
    expect(GOOGLE_REFRESH_MASK).toBe('id,displayName,formattedAddress,location,businessStatus,nationalPhoneNumber,websiteUri,regularOpeningHours,rating,userRatingCount');
  });
  it('GETs with no session token, key, mask and no-store', async () => {
    const f = mk(fx);
    await googleRefreshDetails('ChIJabc', o(f));
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJabc?languageCode=th');
    expect(init.method).toBe('GET');
    expect(init.cache).toBe('no-store');
    const h = init.headers as Record<string, string>;
    expect(h['X-Goog-Api-Key']).toBe('K');
    expect(h['X-Goog-FieldMask']).toBe(GOOGLE_REFRESH_MASK);
  });
  it('parses the live fixture', async () => {
    expect(await googleRefreshDetails(fx.id, o(mk(fx)))).toEqual({
      id: fx.id,
      name: fx.displayName.text,
      address: fx.formattedAddress,
      lat: fx.location.latitude,
      lng: fx.location.longitude,
      phone: (fx as { nationalPhoneNumber?: string }).nationalPhoneNumber ?? null,
      website: (fx as { websiteUri?: string }).websiteUri ?? null,
      hours: fx.regularOpeningHours.weekdayDescriptions.join('; '),
      rating: fx.rating,
      reviews: fx.userRatingCount,
      businessStatus: fx.businessStatus,
    });
  });
  it('returns the response id, falling back to the requested one', async () => {
    expect((await googleRefreshDetails('ChIJold', o(mk({ ...fx, id: 'ChIJnew' }))))?.id).toBe('ChIJnew');
    expect((await googleRefreshDetails('ChIJold', o(mk(omit('id')))))?.id).toBe('ChIJold');
  });
  it('unknown or missing businessStatus → null; missing name → empty; missing location → null', async () => {
    expect((await googleRefreshDetails('x', o(mk({ ...fx, businessStatus: 'SOMETHING_NEW' }))))?.businessStatus).toBeNull();
    expect((await googleRefreshDetails('x', o(mk(omit('businessStatus')))))?.businessStatus).toBeNull();
    expect((await googleRefreshDetails('x', o(mk(omit('displayName')))))?.name).toBe('');
    expect(await googleRefreshDetails('x', o(mk(omit('location'))))).toBeNull();
  });
  it.each([400, 404])('%i rejects with GoogleHttpError', async (status) => {
    const f = vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;
    await expect(googleRefreshDetails('x', o(f))).rejects.toMatchObject({ name: 'GoogleHttpError', status });
  });
  it('network error and real timeout → status 0', async () => {
    const f = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(googleRefreshDetails('x', o(f))).rejects.toMatchObject({ status: 0 });
    const hang = ((_u: unknown, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      })) as unknown as typeof fetch;
    await expect(googleRefreshDetails('x', { ...o(hang), timeoutMs: 1 })).rejects.toMatchObject({ status: 0 });
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
    expect(out.map((p) => p.name)).toEqual(['Jay Fai', 'Jay Fai Saab', 'Jayfair Recruitment Solutions Limited', 'Jay Somjai Fashion', 'Fairborn Jay F MD']);
    const d = await googleDetails(P0, { key: 'K', lang: 'en', session: null, fields: 'full', fetchImpl: f });
    expect(d?.name).toBe('Raan Jay Fai');
    const t = await googleDetails(P1, { key: 'K', lang: 'en', session: null, fields: 'full', fetchImpl: f });
    expect(t).toMatchObject({ name: 'Jay Fai Saab', kind: 'food', rating: 3.5, reviews: 13 });
    expect(t?.lat).not.toBe(d?.lat);
    // basic mask: no displayName / Enterprise fields, like the real billing shape
    const b = await googleDetails(P1, { key: 'K', lang: 'en', session: null, fields: 'basic', fetchImpl: f });
    expect(b).toMatchObject({ name: '', phone: null, website: null, rating: null });
    const raw = await f(`https://places.googleapis.com/v1/places/${P0}`, { headers: { 'X-Goog-FieldMask': GOOGLE_MASKS.basic } });
    expect(Object.keys(await raw.json()).sort()).toEqual(['formattedAddress', 'id', 'location', 'types']);
    expect((await f('https://places.googleapis.com/v2/nope')).status).toBe(404);
  });
  it('refresh mask gets the refresh fixture with the requested id; other masks unchanged', async () => {
    const f = fakeGoogleFetch();
    const get = async (id: string, mask: string) =>
      f(`https://places.googleapis.com/v1/places/${id}`, { headers: { 'X-Goog-FieldMask': mask } });
    const r = await (await get('ChIJrequested', GOOGLE_REFRESH_MASK)).json();
    expect(r).toMatchObject({ id: 'ChIJrequested', businessStatus: refreshFx.businessStatus });
    expect((await (await get(P1, GOOGLE_MASKS.full)).json()).displayName.text).toBe('Jay Fai Saab');
    expect((await (await get(P0, GOOGLE_MASKS.full)).json()).displayName.text).toBe('Raan Jay Fai');
    expect(Object.keys(await (await get(P0, GOOGLE_MASKS.basic)).json()).sort()).toEqual(['formattedAddress', 'id', 'location', 'types']);
  });
  it('synthetic ids: Gone → 404, Bad → 400, Closed → CLOSED_TEMPORARILY', async () => {
    const f = fakeGoogleFetch();
    const get = (id: string, mask = GOOGLE_REFRESH_MASK) =>
      f(`https://places.googleapis.com/v1/places/${id}`, { headers: { 'X-Goog-FieldMask': mask } });
    for (const id of ['ChIJfakeGone1', 'ChIJfakeBad1', 'ChIJfakeClosed1']) expect(isValidGoogleId(id)).toBe(true);
    const gone = await get('ChIJfakeGone1');
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: { code: 404, status: 'NOT_FOUND' } });
    const bad = await get('ChIJfakeBad1');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: 400, status: 'INVALID_ARGUMENT' } });
    const closed = await (await get('ChIJfakeClosed1')).json();
    expect(closed).toMatchObject({ id: 'ChIJfakeClosed1', businessStatus: 'CLOSED_TEMPORARILY' });
  });
});

describe('photos', () => {
  it('isValidPhotoName accepts only places/<id>/photos/<ref>', () => {
    expect(isValidPhotoName(`places/${P0}/photos/AbC_-9`)).toBe(true);
    for (const bad of ['../x', `places/${P0}/photos/AbC/media`, 'https://evil/places/a/photos/b', 'places//photos/b', `places/${P0}/photos/`]) {
      expect(isValidPhotoName(bad)).toBe(false);
    }
  });
  it('googlePhotoUri GETs the media endpoint with skipHttpRedirect and returns photoUri', async () => {
    const f = mk({ name: `places/${P0}/photos/AbC/media`, photoUri: 'https://lh3.googleusercontent.com/p/abc=s480' });
    const uri = await googlePhotoUri(`places/${P0}/photos/AbC`, { key: 'K', maxWidthPx: 480, fetchImpl: f });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://places.googleapis.com/v1/places/${P0}/photos/AbC/media?maxWidthPx=480&skipHttpRedirect=true`);
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('K');
    expect(uri).toBe('https://lh3.googleusercontent.com/p/abc=s480');
  });
  it('googlePhotoUri: invalid name → null without fetching; non-https photoUri → null', async () => {
    const f = mk({ photoUri: 'javascript:alert(1)' });
    expect(await googlePhotoUri('../x', { key: 'K', maxWidthPx: 480, fetchImpl: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(await googlePhotoUri(`places/${P0}/photos/AbC`, { key: 'K', maxWidthPx: 480, fetchImpl: f })).toBeNull();
  });
});
