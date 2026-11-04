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
      hotels: [{ name: 'H', lat: 1, lng: 2, costAmount: 500 }],
      // Budget uses the real ParsedBudgetSection shape ({ config, currency });
      // hotel cost 500 > config.amount 100 → over_budget.
      sections: {
        transport: [],
        expenses: [],
        notes: [],
        budget: { config: { amount: 100, basis: 'total' }, currency: null },
      },
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

describe('importTripIdempotent dryRun preview dates + currency (TP-0139)', () => {
  async function preview(plan: unknown) {
    const resolveLinks = vi.fn().mockResolvedValue({ plan, warnings: [] });
    const deps = { loadApiTrip: vi.fn(), resolveLinks } as unknown as ImportDeps;
    const res = await importTripIdempotent('u', new Request('http://x'), { trip: { title: 'T' } }, deps, true);
    return (await res.json()).trip;
  }
  const base = { subtitle: null, cover: null };

  it('derives dateIso per day from startDate (start + idx)', async () => {
    const trip = await preview({
      trip: { ...base, title: 'T', startDate: '2027-04-10', endDate: '2027-04-12' },
      days: [
        { date: null, places: [] },
        { date: null, places: [] },
        { date: null, places: [] },
      ],
      hotels: [],
      sections: null,
    });
    expect(trip.days.map((d: { dateIso: string | null }) => d.dateIso)).toEqual([
      '2027-04-10',
      '2027-04-11',
      '2027-04-12',
    ]);
  });

  it('uses an explicit day.date as dateIso (matches commit)', async () => {
    const trip = await preview({
      trip: { ...base, title: 'T', startDate: '2027-04-10', endDate: null },
      days: [{ date: '2027-05-01', places: [] }, { date: null, places: [] }],
      hotels: [],
      sections: null,
    });
    expect(trip.days.map((d: { dateIso: string | null }) => d.dateIso)).toEqual(['2027-05-01', '2027-04-11']);
  });

  it('dateIso is null when there is no start date', async () => {
    const trip = await preview({
      trip: { ...base, title: 'T', startDate: null, endDate: null },
      days: [{ date: null, places: [] }],
      hotels: [],
      sections: null,
    });
    expect(trip.days[0].dateIso).toBeNull();
  });

  it('currency comes from the budget section', async () => {
    const trip = await preview({
      trip: { ...base, title: 'T', startDate: null, endDate: null },
      days: [],
      hotels: [],
      sections: { transport: [], expenses: [], notes: [], budget: { config: null, currency: 'THB' } },
    });
    expect(trip.currency).toBe('THB');
  });

  it('currency is null when no budget currency is given', async () => {
    const trip = await preview({
      trip: { ...base, title: 'T', startDate: null, endDate: null },
      days: [],
      hotels: [],
      sections: null,
    });
    expect(trip.currency).toBeNull();
  });
});

describe('importTripIdempotent dryRun legs (TP-0141)', () => {
  it('previews segments + arrive and warns arrive_without_origin', async () => {
    const body = {
      trip: { title: 'T', startDate: '2030-01-01', endDate: '2030-01-01' },
      days: [
        {
          places: [
            { kind: 'sight', name: 'A', lat: 35, lng: 135, arrive: { mode: 'walk', note: 'from station' } },
            { kind: 'sight', name: 'B', lat: 35, lng: 135, arrive: { mode: 'transit', durationMin: 30, note: 'JR' } },
            { kind: 'sight', name: 'C', lat: 35, lng: 135 },
          ],
        },
      ],
    };
    const resolveLinks = vi.fn(async (_u: string, plan: unknown) => ({ plan, warnings: [] }));
    const deps = { loadApiTrip: vi.fn(), resolveLinks } as unknown as ImportDeps;
    const res = await importTripIdempotent('u', new Request('http://x'), body, deps, true);
    const out = await res.json();
    const day = out.trip.days[0];
    expect(day.segments).toHaveLength(2);
    expect(day.segments[0]).toMatchObject({ idx: 0, mode: 'transit', note: 'JR', durationMin: 30 });
    expect(day.segments[1]).toMatchObject({ idx: 1, mode: 'drive', note: null, durationMin: null });
    expect(day.places[1].arrive).toEqual({ mode: 'transit', durationMin: 30, note: 'JR' });
    expect(day.places[2].arrive).toEqual({ mode: 'drive', durationMin: null, note: null });
    expect(day.start).toEqual({ mode: 'walk', durationMin: null, note: 'from station' });
    expect(day.places[0].arrive).toEqual(day.start);
    expect(day).not.toHaveProperty('arrives');
    const codes = out.warnings.map((w: { code: string }) => w.code);
    expect(codes).toContain('arrive_without_origin');
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
