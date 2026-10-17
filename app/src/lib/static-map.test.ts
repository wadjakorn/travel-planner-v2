import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildStaticMapUrl } from './static-map';

describe('buildStaticMapUrl', () => {
  const original = process.env.GEOAPIFY_API_KEY;
  beforeEach(() => { process.env.GEOAPIFY_API_KEY = 'test-key'; });
  afterEach(() => {
    if (original === undefined) delete process.env.GEOAPIFY_API_KEY;
    else process.env.GEOAPIFY_API_KEY = original;
  });

  it('null without a key', () => {
    delete process.env.GEOAPIFY_API_KEY;
    expect(buildStaticMapUrl([{ lat: 13.7, lng: 100.5 }])).toBeNull();
  });

  it('null without usable points', () => {
    expect(buildStaticMapUrl([{ lat: 0, lng: 0 }, { lat: 999, lng: 1 }])).toBeNull();
  });

  it('builds a Geoapify URL with lon,lat markers', () => {
    const u = new URL(buildStaticMapUrl([{ lat: 13.7, lng: 100.5 }, { lat: 18.8, lng: 98.97 }])!);
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
    const markers = new URL(buildStaticMapUrl(pts)!).searchParams.get('marker')!.split('|');
    expect(markers).toHaveLength(12);
    expect(markers[0]).toContain('13.00000');
    expect(markers[11]).toContain('13.29000');
  });
});
