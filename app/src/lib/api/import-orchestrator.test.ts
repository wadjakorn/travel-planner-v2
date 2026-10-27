import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {}, dbNode: {} }));
vi.mock('@/lib/api/idempotency', () => ({
  claimKey: vi.fn(),
  persistCompletion: vi.fn(),
  releaseClaim: vi.fn(),
}));

import { claimKey } from '@/lib/api/idempotency';
import { importTripIdempotent, type ImportDeps } from './import-orchestrator';

beforeEach(() => vi.clearAllMocks());

describe('importTripIdempotent dryRun', () => {
  it('does NOT claim an idempotency key and returns the preview shape', async () => {
    // Pins the dryRun-before-claimKey invariant: if the dryRun branch is ever
    // moved below claimKey, claimKey runs (and, with no mock return, the flow
    // throws) — this test fails either way.
    const resolveLinks = vi.fn().mockResolvedValue({ plan: {}, warnings: [] });
    const deps = { loadApiTrip: vi.fn(), resolveLinks } as unknown as ImportDeps;
    const res = await importTripIdempotent(
      'u',
      new Request('http://x'),
      { trip: { title: 'T' } },
      deps,
      true,
    );
    expect(claimKey).not.toHaveBeenCalled();
    expect(resolveLinks).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ trip: null, warnings: [] });
  });

  it('surfaces resolveLinks warnings in the preview', async () => {
    const warnings = [{ code: 'coords_approx', message: 'm', day: 1, place: 1 }];
    const resolveLinks = vi.fn().mockResolvedValue({ plan: {}, warnings });
    const deps = { loadApiTrip: vi.fn(), resolveLinks } as unknown as ImportDeps;
    const res = await importTripIdempotent(
      'u',
      new Request('http://x'),
      { trip: { title: 'T' } },
      deps,
      true,
    );
    expect(claimKey).not.toHaveBeenCalled();
    expect((await res.json()).warnings).toEqual(warnings);
  });
});

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
