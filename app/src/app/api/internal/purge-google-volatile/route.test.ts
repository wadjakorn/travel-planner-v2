import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/google-sync-service', () => ({
  purgeExpiredVolatile: vi.fn(async () => ({ rating: 2, hours: 1 })),
}));

import { purgeExpiredVolatile } from '@/lib/services/google-sync-service';
import { GET } from './route';

const req = (auth?: string) =>
  new NextRequest('http://t.local/api/internal/purge-google-volatile', {
    headers: auth ? { authorization: auth } : {},
  });

describe('GET /api/internal/purge-google-volatile', () => {
  beforeEach(() => vi.mocked(purgeExpiredVolatile).mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it('401 when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(req('Bearer '));
    expect(res.status).toBe(401);
    expect(purgeExpiredVolatile).not.toHaveBeenCalled();
  });
  it('401 on a wrong bearer, service not called', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await GET(req('Bearer nope'));
    expect(res.status).toBe(401);
    expect(purgeExpiredVolatile).not.toHaveBeenCalled();
  });
  it('200 with the purge counts on the right bearer', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await GET(req('Bearer s3cret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rating: 2, hours: 1 });
    expect(purgeExpiredVolatile).toHaveBeenCalledTimes(1);
  });
});
