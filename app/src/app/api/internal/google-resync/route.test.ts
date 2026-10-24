import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/services/google-sync-service', () => ({
  runGoogleResync: vi.fn(async () => ({ refreshed: 1, notFound: 0, invalid: 0, skipped: 0, failed: 0, stopped: null })),
}));

import { runGoogleResync } from '@/lib/services/google-sync-service';
import { GET } from './route';

const req = (auth?: string, qs = '') =>
  new NextRequest(`http://t.local/api/internal/google-resync${qs}`, {
    headers: auth ? { authorization: auth } : {},
  });

describe('GET /api/internal/google-resync', () => {
  beforeEach(() => vi.mocked(runGoogleResync).mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it('401 when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(req('Bearer '));
    expect(res.status).toBe(401);
    expect(runGoogleResync).not.toHaveBeenCalled();
  });
  it('401 on a wrong bearer, service not called', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await GET(req('Bearer nope'));
    expect(res.status).toBe(401);
    expect(runGoogleResync).not.toHaveBeenCalled();
  });
  it('200 with the result on the right bearer, source forced to cron', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await GET(req('Bearer s3cret', '?source=manual'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refreshed: 1, notFound: 0, invalid: 0, skipped: 0, failed: 0, stopped: null });
    expect(runGoogleResync).toHaveBeenCalledTimes(1);
    expect(runGoogleResync).toHaveBeenCalledWith({ source: 'cron' });
  });
  it('500 resync_failed without leaking details when the service throws', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(runGoogleResync).mockRejectedValueOnce(new Error('postgres://u:pw@host/db boom'));
    const res = await GET(req('Bearer s3cret'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('{"error":"resync_failed"}');
  });
});
