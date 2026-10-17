import { describe, expect, it, vi } from 'vitest';
import { allowPlacesRequest, PLACES_RATE_LIMIT } from './rate-limit';

describe('allowPlacesRequest', () => {
  it('keys on the user id with the shared budget', async () => {
    const consume = vi.fn(async () => ({ ok: true as const }));
    expect(await allowPlacesRequest('u1', consume)).toBe(true);
    expect(consume).toHaveBeenCalledWith('places:u1', 120, 600);
    expect(PLACES_RATE_LIMIT).toEqual({ max: 120, windowSeconds: 600 });
  });
  it('denies when the bucket is exhausted', async () => {
    const consume = vi.fn(async () => ({ ok: false as const, retryAfter: 30, limit: 120 }));
    expect(await allowPlacesRequest('u1', consume)).toBe(false);
  });
  it('fails open when storage throws', async () => {
    const consume = vi.fn(async () => { throw new Error('db down'); });
    expect(await allowPlacesRequest('u1', consume)).toBe(true);
  });
});
