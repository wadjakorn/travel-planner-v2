import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { buildStaticMapUrl } from './static-map';

const BKK = { lat: 13.7563, lng: 100.5018 };
const CNX = { lat: 18.7883, lng: 98.9853 };

describe('buildStaticMapUrl', () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  const originalSecret = process.env.GOOGLE_MAPS_URL_SIGNING_SECRET;

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    delete process.env.GOOGLE_MAPS_URL_SIGNING_SECRET;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
    if (originalSecret === undefined)
      delete process.env.GOOGLE_MAPS_URL_SIGNING_SECRET;
    else process.env.GOOGLE_MAPS_URL_SIGNING_SECRET = originalSecret;
  });

  it('returns null without a server key', () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    expect(buildStaticMapUrl([BKK])).toBeNull();
  });

  it('returns null when no point is usable', () => {
    expect(buildStaticMapUrl([])).toBeNull();
    expect(buildStaticMapUrl([{ lat: 0, lng: 0 }])).toBeNull();
    expect(buildStaticMapUrl([{ lat: 91, lng: 0 }])).toBeNull();
    expect(buildStaticMapUrl([{ lat: NaN, lng: 1 }])).toBeNull();
  });

  it('builds a marker URL with no center/zoom so Google auto-fits', () => {
    const url = new URL(buildStaticMapUrl([BKK, CNX])!);
    expect(url.origin + url.pathname).toBe(
      'https://maps.googleapis.com/maps/api/staticmap',
    );
    expect(url.searchParams.get('size')).toBe('600x315');
    expect(url.searchParams.get('scale')).toBe('2');
    expect(url.searchParams.get('key')).toBe('test-key');
    expect(url.searchParams.get('center')).toBeNull();
    expect(url.searchParams.get('zoom')).toBeNull();
    expect(url.searchParams.get('markers')).toBe(
      'size:mid|color:0xE4572E|13.75630,100.50180|18.78830,98.98530',
    );
  });

  it('drops unusable points but keeps the usable ones', () => {
    const markers = new URL(
      buildStaticMapUrl([{ lat: 0, lng: 0 }, BKK])!,
    ).searchParams.get('markers')!;
    expect(markers).toContain('13.75630,100.50180');
    expect(markers.split('|').filter((s) => s.includes(','))).toHaveLength(1);
  });

  it('samples down to 12 markers, keeping first and last', () => {
    const points = Array.from({ length: 40 }, (_, i) => ({
      lat: 1 + i,
      lng: 100,
    }));
    const coords = new URL(buildStaticMapUrl(points)!)
      .searchParams.get('markers')!
      .split('|')
      .filter((s) => s.includes(','));
    expect(coords).toHaveLength(12);
    expect(coords[0]).toBe('1.00000,100.00000');
    expect(coords[11]).toBe('40.00000,100.00000');
  });

  it('appends a valid HMAC-SHA1 signature when a secret is configured', () => {
    const secret = 'c2VjcmV0LXNpZ25pbmcta2V5'; // base64
    process.env.GOOGLE_MAPS_URL_SIGNING_SECRET = secret;

    const url = buildStaticMapUrl([BKK])!;
    const [unsigned, signature] = url.split('&signature=');
    expect(signature).toBeTruthy();

    const expected = crypto
      .createHmac('sha1', Buffer.from(secret, 'base64'))
      .update(new URL(unsigned).pathname + new URL(unsigned).search)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    expect(signature).toBe(expected);
  });
});
