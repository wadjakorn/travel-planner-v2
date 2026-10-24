import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MapsConfig } from './maps/config';
import { buildStaticMapUrl, fetchStaticMapDataUri } from './static-map';

const BKK = { lat: 13.7, lng: 100.5 };

function cfg(over: Partial<MapsConfig> = {}, google: Partial<MapsConfig['google']> = {}): MapsConfig {
  return {
    provider: 'open',
    googlePlaces: false,
    staticMap: 'geoapify',
    geoapifyKey: 'test-key',
    browser: null,
    google: {
      serverKey: '',
      signingSecret: '',
      caps: { full: 30, basic: 80, autocomplete: 300 },
      fake: false,
      ...google,
    },
    ...over,
  };
}

const SECRET = 'c2VjcmV0LXNpZ25pbmcta2V5'; // base64
const googleCfg = (secret = SECRET) =>
  cfg({ provider: 'google', staticMap: 'google' }, { serverKey: 'gkey', signingSecret: secret });

describe('buildStaticMapUrl (geoapify)', () => {
  it('null without a key', () => {
    expect(buildStaticMapUrl([BKK], {}, cfg({ geoapifyKey: '' }))).toBeNull();
  });

  it('null without usable points', () => {
    expect(
      buildStaticMapUrl([{ lat: 0, lng: 0 }, { lat: 999, lng: 1 }], {}, cfg()),
    ).toBeNull();
  });

  it('builds a Geoapify URL with lon,lat markers', () => {
    const u = new URL(buildStaticMapUrl([BKK, { lat: 18.8, lng: 98.97 }], {}, cfg())!);
    expect(u.origin + u.pathname).toBe('https://maps.geoapify.com/v1/staticmap');
    expect(u.searchParams.get('width')).toBe('600');
    expect(u.searchParams.get('height')).toBe('315');
    expect(u.searchParams.get('scaleFactor')).toBe('2');
    expect(u.searchParams.get('apiKey')).toBe('test-key');
    const markers = u.searchParams.get('marker')!.split('|');
    expect(markers).toHaveLength(2);
    expect(markers[0]).toBe('lonlat:100.50000,13.70000;type:circle;color:#e4572e;size:small');
  });

  it('caps markers at 12, keeping first and last', () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ lat: 13 + i * 0.01, lng: 100 }));
    const markers = new URL(buildStaticMapUrl(pts, {}, cfg())!).searchParams.get('marker')!.split('|');
    expect(markers).toHaveLength(12);
    expect(markers[0]).toContain('13.00000');
    expect(markers[11]).toContain('13.29000');
  });
});

describe('buildStaticMapUrl (provider switch)', () => {
  it('null when staticMap is null', () => {
    expect(buildStaticMapUrl([BKK], {}, cfg({ staticMap: null }))).toBeNull();
  });

  it('builds a Google URL', () => {
    const url = buildStaticMapUrl([BKK, { lat: 18.8, lng: 98.97 }], {}, googleCfg())!;
    expect(url.startsWith('https://maps.googleapis.com/maps/api/staticmap?')).toBe(true);
    const u = new URL(url);
    expect(u.searchParams.get('size')).toBe('600x315');
    expect(u.searchParams.get('scale')).toBe('2');
    expect(u.searchParams.get('key')).toBe('gkey');
    expect(u.searchParams.get('markers')!.startsWith('size:mid|color:0xE4572E|')).toBe(true);
    expect(u.searchParams.has('center')).toBe(false);
    expect(u.searchParams.has('zoom')).toBe(false);
  });

  it('Google: uppercases a custom marker colour', () => {
    const u = new URL(buildStaticMapUrl([BKK], { markerColor: '#abcdef' }, googleCfg())!);
    expect(u.searchParams.get('markers')).toContain('color:0xABCDEF|');
  });

  it('Google: null without usable points', () => {
    expect(buildStaticMapUrl([{ lat: 0, lng: 0 }], {}, googleCfg())).toBeNull();
  });

  it('Google: samples down to 12 markers, keeping first and last, dropping (0,0)', () => {
    const points = [
      { lat: 0, lng: 0 },
      ...Array.from({ length: 40 }, (_, i) => ({ lat: 1 + i, lng: 100 })),
    ];
    const coords = new URL(buildStaticMapUrl(points, {}, googleCfg())!)
      .searchParams.get('markers')!
      .split('|')
      .filter((s) => s.includes(','));
    expect(coords).toHaveLength(12);
    expect(coords[0]).toBe('1.00000,100.00000');
    expect(coords[11]).toBe('40.00000,100.00000');
  });

  it('Google: appends a valid HMAC-SHA1 signature', () => {
    const url = buildStaticMapUrl([BKK], {}, googleCfg())!;
    const [unsigned, signature] = url.split('&signature=');
    expect(signature).toBeTruthy();
    const expected = crypto
      .createHmac('sha1', Buffer.from(SECRET, 'base64'))
      .update(new URL(unsigned).pathname + new URL(unsigned).search)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(signature).toBe(expected);
  });
});

describe('fetchStaticMapDataUri', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const fn = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fn);
    return fn;
  }
  const initOf = (fn: ReturnType<typeof stubFetch>) =>
    (fn.mock.calls[0] as unknown as [string, { next?: { revalidate?: number } }])[1];

  it('Google revalidates daily', async () => {
    const fn = stubFetch();
    const out = await fetchStaticMapDataUri([BKK], {}, googleCfg());
    expect(out).toBe('data:image/png;base64,AQID');
    expect(initOf(fn).next?.revalidate).toBe(86400);
  });

  it('Geoapify keeps the 7-day revalidate', async () => {
    const fn = stubFetch();
    await fetchStaticMapDataUri([BKK], {}, cfg());
    expect(initOf(fn).next?.revalidate).toBe(60 * 60 * 24 * 7);
  });

  it('returns null without fetching when staticMap is null', async () => {
    const fn = stubFetch();
    expect(await fetchStaticMapDataUri([BKK], {}, cfg({ staticMap: null }))).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});
