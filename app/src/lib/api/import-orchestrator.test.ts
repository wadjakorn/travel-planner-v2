import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {}, dbNode: {} }));
vi.mock('@/lib/api/idempotency', () => ({
  claimKey: vi.fn(),
  persistCompletion: vi.fn(),
  releaseClaim: vi.fn(),
}));

import { claimKey } from '@/lib/api/idempotency';
import { importTripIdempotent, type ImportDeps } from './import-orchestrator';

describe('importTripIdempotent replay', () => {
  it('replays a marker persisted before warnings existed as warnings: []', async () => {
    vi.mocked(claimKey).mockResolvedValue({
      kind: 'replay',
      statusCode: 201,
      responseJson: { __idem: true, tripId: 't1' },
    } as never);
    const loadApiTrip = vi.fn().mockResolvedValue({ id: 't1' });
    const res = await importTripIdempotent('u', new Request('http://x'), {}, { loadApiTrip } as unknown as ImportDeps);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ trip: { id: 't1' }, warnings: [] });
    expect(loadApiTrip).toHaveBeenCalledWith('t1');
  });
});
