import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceError } from '@/lib/services/service-error';
import { PlacesSearchUnavailableError } from '@/lib/places/text-search';

const requireApiUser = vi.fn();
const consumeRateLimit = vi.fn();
const consumeRateLimitKey = vi.fn();
const searchPlacesByText = vi.fn();

vi.mock('@/lib/api-auth', () => ({ requireApiUser: (...a: unknown[]) => requireApiUser(...a) }));
vi.mock('@/lib/api/rate-limit', () => ({
  consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a),
  consumeRateLimitKey: (...a: unknown[]) => consumeRateLimitKey(...a),
}));
vi.mock('@/lib/places/text-search', async (orig) => {
  const m = await orig<typeof import('@/lib/places/text-search')>();
  return { ...m, searchPlacesByText: (...a: unknown[]) => searchPlacesByText(...a) };
});

import { GET } from './route';

const req = (qs = '') => new Request(`http://localhost/api/v1/places/search${qs}`, { headers: { authorization: 'Bearer t' } });

beforeEach(() => {
  vi.clearAllMocks();
  requireApiUser.mockResolvedValue({ tokenId: 'tok', userId: 'u1', scope: 'read-write' });
  consumeRateLimit.mockResolvedValue({ ok: true });
  consumeRateLimitKey.mockResolvedValue({ ok: true });
  searchPlacesByText.mockResolvedValue([]);
});

describe('GET /api/v1/places/search', () => {
  it('401 when the token is missing/invalid', async () => {
    requireApiUser.mockRejectedValue(new ServiceError('unauthorized', 'Missing bearer token'));
    const res = await GET(req('?q=wat'));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('400 when q is missing or empty', async () => {
    expect((await GET(req())).status).toBe(400);
    const res = await GET(req('?q=%20%20'));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'bad_request' });
    expect(searchPlacesByText).not.toHaveBeenCalled();
  });

  it('200 returns the service results and uses a per-user search bucket', async () => {
    searchPlacesByText.mockResolvedValue([
      { placeId: 'abc', name: 'Wat Arun', lat: 13.74, lng: 100.48, address: 'BKK', types: ['tourist_attraction'] },
    ]);
    const res = await GET(req('?q=wat%20arun&near=13.75,100.5&radius=3000'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { placeId: 'abc', name: 'Wat Arun', lat: 13.74, lng: 100.48, address: 'BKK', types: ['tourist_attraction'] },
    ]);
    expect(consumeRateLimitKey).toHaveBeenCalledWith('places:search:u1', 200, 86400);
    expect(searchPlacesByText).toHaveBeenCalledWith('wat arun', { near: { lat: 13.75, lng: 100.5 }, radius: 3000 });
  });

  it('400 on a malformed near', async () => {
    expect((await GET(req('?q=x&near=13.75'))).status).toBe(400);
  });

  it('429 when the per-user daily cap is exceeded', async () => {
    consumeRateLimitKey.mockResolvedValue({ ok: false, retryAfter: 3600, limit: 200 });
    const res = await GET(req('?q=wat'));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(await res.json()).toMatchObject({ error: 'rate_limited' });
    expect(searchPlacesByText).not.toHaveBeenCalled();
  });

  it('still serves when the limiter DB throws (fail open)', async () => {
    consumeRateLimitKey.mockRejectedValue(new Error('db down'));
    expect((await GET(req('?q=wat'))).status).toBe(200);
    expect(searchPlacesByText).toHaveBeenCalled();
  });

  it('503 when the provider key is unconfigured', async () => {
    searchPlacesByText.mockRejectedValue(new PlacesSearchUnavailableError());
    const res = await GET(req('?q=wat'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'unavailable' });
  });
});
