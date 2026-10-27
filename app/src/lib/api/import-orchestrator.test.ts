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
  it('does NOT claim an idempotency key (invariant pinned)', async () => {
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
    expect(await res.json()).toEqual({ trip: expect.any(Object), warnings: [] });
  });

  it('returns a populated preview (days + places + hotels) with semantic warnings', async () => {
    // A plan with a hotel-less dated night, a coordless place, and an
    // over-budget hotel cost: the preview is non-null and carries the warnings.
    const plan = {
      trip: { title: 'T', startDate: '2026-01-01', endDate: '2026-01-02', subtitle: null, cover: null },
      // Day 0 is a hotel-less night with a coordless place; day 1 is checkout.
      days: [
        { date: '2026-01-01', places: [{ kind: 'sight', name: 'A', lat: null, lng: null, tags: [] }] },
        { date: '2026-01-02', places: [] },
      ],
      hotels: [{ name: 'H', costAmount: 500 }],
      sections: { transport: [], expenses: [], notes: [], budget: { amount: 100, basis: 'total' } },
    };
    const resolveLinks = vi.fn().mockResolvedValue({ plan, warnings: [] });
    const deps = { loadApiTrip: vi.fn(), resolveLinks } as unknown as ImportDeps;
    // Body only has to pass parseImportPlan; the mocked resolveLinks supplies
    // the preview plan the orchestrator actually renders.
    const res = await importTripIdempotent('u', new Request('http://x'), { trip: { title: 'T' } }, deps, true);
    expect(claimKey).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.trip).not.toBeNull();
    expect(body.trip.days).toHaveLength(2);
    expect(body.trip.days[0].places).toHaveLength(1);
    expect(body.trip.hotels).toHaveLength(1);
    const codes = body.warnings.map((w: { code: string }) => w.code).sort();
    expect(codes).toEqual(['night_without_hotel', 'over_budget', 'place_without_coords']);
  });

  it('surfaces resolveLinks warnings merged into the preview', async () => {
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
    // plan {} contributes no semantic warnings, so only the link warning shows.
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
