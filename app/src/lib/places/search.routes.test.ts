import { describe, expect, it, vi } from 'vitest';
import { searchPlaces } from './search';

vi.mock('@/lib/maps/config', async (orig) => {
  const m = await orig<typeof import('@/lib/maps/config')>();
  return { ...m, MAPS_CONFIG: m.readMapsConfig({ MAPS_PROVIDER: 'google', GOOGLE_MAPS_API_KEY: 'S', GOOGLE_MAPS_URL_SIGNING_SECRET: 'X', GOOGLE_MAPS_BROWSER_KEY: 'B', GOOGLE_MAPS_MAP_ID: 'M' }) };
});

describe('routes get MAPS_CONFIG', () => {
  it('calls Google when no config is injected', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      if (String(input).includes('googleapis')) {
        return new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: 'ChIJabc', text: { text: 'X' } } }] }));
      }
      throw new Error('unexpected');
    });
    const consume = vi.fn(async () => ({ ok: true as const }));
    const r = await searchPlaces('x', { fetchImpl, consume });
    expect(r[0].id).toBe('ChIJabc');
    expect(consume).toHaveBeenCalledWith('gplaces:autocomplete', 300, 86400);
  });
});
