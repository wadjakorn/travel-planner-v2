import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleHttpError } from '@/lib/places/google';

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

import { POST } from './route';

const req = (body: unknown) =>
  new Request('http://localhost/api/v1/places/search/batch', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireApiUser.mockResolvedValue({ tokenId: 'tok', userId: 'u1', scope: 'read-write' });
  consumeRateLimit.mockResolvedValue({ ok: true });
  consumeRateLimitKey.mockResolvedValue({ ok: true });
  searchPlacesByText.mockImplementation(async (q: string) => [{ placeId: `id-${q}`, name: q, lat: 1, lng: 2 }]);
});

describe('POST /places/search/batch (TP-0147)', () => {
  it('returns results in order with keys; one token-limiter hit, one quota unit per query', async () => {
    const res = await POST(req({ queries: [{ q: 'Kiyomizu', key: 'a' }, { q: 'Gion' }, { q: 'Nishiki', near: { lat: 35, lng: 135.7 }, radius: 2000 }] }));
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results.map((r: { key: string }) => r.key)).toEqual(['a', '1', '2']);
    expect(results[2].results[0].name).toBe('Nishiki');
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(consumeRateLimitKey).toHaveBeenCalledTimes(3);
    expect(searchPlacesByText).toHaveBeenCalledWith('Nishiki', { near: { lat: 35, lng: 135.7 }, radius: 2000 });
  });

  it('accepts near as "lat,lng" too', async () => {
    await POST(req({ queries: [{ q: 'x', near: '13.75, 100.5' }] }));
    expect(searchPlacesByText).toHaveBeenCalledWith('x', { near: { lat: 13.75, lng: 100.5 }, radius: null });
  });

  it('a provider failure or exhausted quota fails only that query', async () => {
    searchPlacesByText.mockImplementation(async (q: string) => {
      if (q === 'boom') throw new GoogleHttpError(503, 'down');
      return [{ name: q }];
    });
    consumeRateLimitKey.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, retryAfter: 60 });
    const res = await POST(req({ queries: [{ q: 'ok' }, { q: 'boom' }, { q: 'late' }] }));
    expect(res.status).toBe(200);
    const { results } = await res.json();
    expect(results[0]).toEqual({ key: '0', results: [{ name: 'ok' }] });
    expect(results[1].error.status).toBe(502);
    expect(results[2].error.status).toBe(429);
  });

  it('400 for an empty or oversized batch, a missing q, a bad near or radius', async () => {
    for (const body of [
      { queries: [] },
      { queries: Array.from({ length: 26 }, () => ({ q: 'x' })) },
      { queries: [{ q: '  ' }] },
      { queries: [{ q: 'x', near: '1,' }] },
      { queries: [{ q: 'x', radius: -1 }] },
      { nope: 1 },
    ]) {
      expect((await POST(req(body))).status).toBe(400);
    }
    expect(searchPlacesByText).not.toHaveBeenCalled();
  });
});
