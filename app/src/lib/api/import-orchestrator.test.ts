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

// Pass-through hotel resolver: no real lookup ever runs in a unit test.
const passHotels = () => vi.fn(async (plan: unknown) => ({ plan, warnings: [] }));

describe('importTripIdempotent dryRun', () => {
  it('does NOT claim an idempotency key (invariant pinned)', async () => {
    // Pins the dryRun-before-claimKey invariant: if the dryRun branch is ever
    // moved below claimKey, claimKey runs (and, with no mock return, the flow
    // throws) — this test fails either way.
    const resolveLinks = vi.fn().mockResolvedValue({ plan: {}, warnings: [] });
    const deps = { loadApiTrip: vi.fn(), resolveLinks, resolveHotels: passHotels() } as unknown as ImportDeps;
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
    expect(await res.json()).toEqual({ trip: expect.any(Object), warnings: [], summary: {} });
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
    const deps = { loadApiTrip: vi.fn(), resolveLinks, resolveHotels: passHotels() } as unknown as ImportDeps;
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
    const deps = { loadApiTrip: vi.fn(), resolveLinks, resolveHotels: passHotels() } as unknown as ImportDeps;
    const res = await importTripIdempotent(
      'u',
      new Request('http://x'),
      { trip: { title: 'T' } },
      deps,
      true,
    );
    expect(claimKey).not.toHaveBeenCalled();
    // plan {} contributes no semantic warnings, so only the link warning shows,
    // now with a 0-based path and codes (TP-0144), plus the summary.
    const out = await res.json();
    expect(out.warnings).toEqual([
      { code: 'coords_approx', codes: ['coords_approx'], path: '/days/0/places/0', message: 'm', day: 1, place: 1 },
    ]);
    expect(out.summary).toEqual({ coords_approx: 1 });
  });
});

describe('importTripIdempotent dryRun preview dates + currency (TP-0139)', () => {
  async function preview(plan: unknown) {
    const resolveLinks = vi.fn().mockResolvedValue({ plan, warnings: [] });
    const deps = { loadApiTrip: vi.fn(), resolveLinks, resolveHotels: passHotels() } as unknown as ImportDeps;
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
    const deps = { loadApiTrip: vi.fn(), resolveLinks, resolveHotels: passHotels() } as unknown as ImportDeps;
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

describe('importTripIdempotent hotels (TP-0143)', () => {
  const hotelWarning = { code: 'hotel_without_location', path: '/hotels/0', message: 'm' };
  function orderedDeps() {
    const order: string[] = [];
    let seen: unknown;
    const resolveHotels = vi.fn(async (plan: unknown, _i: unknown, budget: unknown) => {
      order.push('hotels');
      seen = budget;
      return { plan, warnings: [hotelWarning] };
    });
    const resolveLinks = vi.fn(async (_u: string, plan: unknown, _l: unknown, d: { budget?: unknown }) => {
      order.push('places');
      expect(d.budget).toBeDefined();
      expect(d.budget).toBe(seen);
      return { plan, warnings: [{ code: 'coords_approx', message: 'p', day: 1, place: 1 }] };
    });
    return { order, resolveHotels, resolveLinks };
  }
  const body = {
    trip: { title: 'T' },
    hotels: [{ status: 'tbd', area: 'Dogo Onsen', query: 'Dogo ryokan' }],
  };

  it('calls resolveHotels before resolveLinks and shares one budget', async () => {
    const { order, resolveHotels, resolveLinks } = orderedDeps();
    const deps = { loadApiTrip: vi.fn(), resolveLinks, resolveHotels } as unknown as ImportDeps;
    const res = await importTripIdempotent('u', new Request('http://x'), body, deps, true);
    expect(claimKey).not.toHaveBeenCalled();
    expect(order).toEqual(['hotels', 'places']);
    expect(resolveHotels).toHaveBeenCalledWith(
      expect.objectContaining({ hotels: [expect.objectContaining({ name: 'Dogo Onsen', status: 'tbd' })] }),
      [{ googleMapsUrl: null, query: 'Dogo ryokan', near: null, approxEcho: false }],
      expect.anything(),
    );
    const out = await res.json();
    // Hotel link warnings first, then place-link, then semantic warnings.
    // One entry per hotel (TP-0144): the link warning leads, the semantic
    // hotel_without_dates folds in; place-link gets its own entry.
    expect(out.warnings[0]).toMatchObject({
      code: 'hotel_without_location',
      codes: ['hotel_without_location', 'hotel_without_dates'],
      path: '/hotels/0',
      message: 'm',
      name: 'Dogo Onsen',
    });
    expect(out.warnings[1]).toMatchObject({ code: 'coords_approx', path: '/days/0/places/0', day: 1, place: 1 });
    expect(out.trip.hotels[0]).toMatchObject({ name: 'Dogo Onsen', status: 'tbd', area: 'Dogo Onsen' });
  });

  it('a bad hotel near is a 400 before any resolve', async () => {
    const { resolveHotels, resolveLinks } = orderedDeps();
    const deps = { loadApiTrip: vi.fn(), resolveLinks, resolveHotels } as unknown as ImportDeps;
    const bad = { trip: { title: 'T' }, hotels: [{ name: 'H', near: 'nope' }] };
    await expect(importTripIdempotent('u', new Request('http://x'), bad, deps, true)).rejects.toThrow(/^hotel 1: /);
    expect(resolveHotels).not.toHaveBeenCalled();
    expect(resolveLinks).not.toHaveBeenCalled();
  });
});

describe('importTripIdempotent transport (TP-0142)', () => {
  const passLinks = (drain = false) =>
    vi.fn(async (_u: string, plan: unknown, _l: unknown, d: { budget?: { take(): boolean } }) => {
      if (drain) while (d.budget?.take()) { /* places spend the whole budget */ }
      return { plan, warnings: [] };
    });
  const base = { trip: { title: 'T', startDate: '2026-03-01', endDate: '2026-03-02' }, days: [{ places: [] }, { places: [] }] };

  it('resolves transport after places on the shared budget (lookup_skipped when drained)', async () => {
    const order: string[] = [];
    const resolveLinks = vi.fn(async (_u: string, plan: unknown, _l: unknown, d: { budget?: { take(): boolean } }) => {
      order.push('places');
      while (d.budget?.take()) { /* drain */ }
      return { plan, warnings: [] };
    });
    const real = (await import('./transport-link')).resolvePlanTransport;
    const resolveTransport = vi.fn(async (...a: Parameters<typeof real>) => {
      order.push('transport');
      return real(...a);
    });
    const deps = { loadApiTrip: vi.fn(), resolveLinks, resolveHotels: passHotels(), resolveTransport } as unknown as ImportDeps;
    const body = {
      ...base,
      transport: [{ type: 'flight', title: 'F', dayIdx: 0, from: { query: 'Suvarnabhumi Airport' }, to: { query: 'Kansai Airport' } }],
    };
    const res = await importTripIdempotent('u', new Request('http://x'), body, deps, true);
    expect(order).toEqual(['places', 'transport']);
    const out = await res.json();
    // Both ends fold into the ride's one entry (TP-0144); details keep the end.
    const ride = out.warnings.find((w: { path: string }) => w.path === '/transport/0');
    expect(ride).toMatchObject({ code: 'lookup_skipped', name: 'F' });
    const skipped = ride.details
      .filter((w: { code: string }) => w.code === 'lookup_skipped')
      .map((w: { path: string }) => w.path);
    expect(skipped).toEqual(['/transport/0/from', '/transport/0/to']);
    expect(res.status).toBe(200);
  });

  it('echoes resolved coords in the preview; lat/lng end needs no lookup; no transport_without_day', async () => {
    const deps = { loadApiTrip: vi.fn(), resolveLinks: passLinks(), resolveHotels: passHotels() } as unknown as ImportDeps;
    const body = {
      ...base,
      transport: [
        { type: 'flight', title: 'F', fromCode: 'BKK', toCode: 'KIX', dayIdx: 0, from: { lat: 13.69, lng: 100.75, name: 'Suvarnabhumi' }, to: { lat: 34.43, lng: 135.24 } },
        { type: 'car', title: 'Loose' },
      ],
    };
    const out = await (await importTripIdempotent('u', new Request('http://x'), body, deps, true)).json();
    expect(out.trip.sections.transport[0]).toMatchObject({ fromLat: 13.69, fromLng: 100.75, toLat: 34.43, fromName: 'Suvarnabhumi' });
    const wd = out.warnings.filter((w: { code: string }) => w.code === 'transport_without_day');
    expect(wd.map((w: { path: string }) => w.path)).toEqual(['/transport/1']);
  });

  it('an end object wins over flat keys: unresolved end never keeps the flat coords (R9)', async () => {
    const deps = { loadApiTrip: vi.fn(), resolveLinks: passLinks(true), resolveHotels: passHotels() } as unknown as ImportDeps;
    const body = {
      ...base,
      transport: [{ type: 'car', title: 'C', dayIdx: 0, fromLat: 1, fromLng: 2, from: { query: 'Somewhere' }, toLat: 5, toLng: 6 }],
    };
    const out = await (await importTripIdempotent('u', new Request('http://x'), body, deps, true)).json();
    const t = out.trip.sections.transport[0];
    expect(t.fromLat).toBeNull();
    expect(t.fromLng).toBeNull();
    // `to` was not sent as an object: flat values stay as parsed.
    expect(t).toMatchObject({ toLat: 5, toLng: 6 });
  });

  it('a bad lone flat key next to an end object is dropped, not a 400 (object wins)', async () => {
    const deps = { loadApiTrip: vi.fn(), resolveLinks: passLinks(), resolveHotels: passHotels() } as unknown as ImportDeps;
    const body = {
      ...base,
      transport: [{ type: 'car', title: 'C', dayIdx: 0, fromLat: 999, from: { lat: 1, lng: 2 } }],
    };
    const out = await (await importTripIdempotent('u', new Request('http://x'), body, deps, true)).json();
    expect(out.trip.sections.transport[0]).toMatchObject({ fromLat: 1, fromLng: 2 });
  });

  it('import: fromName null takes the end name, explicit fromName wins', async () => {
    const deps = { loadApiTrip: vi.fn(), resolveLinks: passLinks(), resolveHotels: passHotels() } as unknown as ImportDeps;
    const body = {
      ...base,
      transport: [
        { type: 'car', title: 'A', dayIdx: 0, fromName: null, from: { name: 'X', lat: 1, lng: 2 } },
        { type: 'car', title: 'B', dayIdx: 0, fromName: 'Keep', from: { name: 'X', lat: 1, lng: 2 } },
      ],
    };
    const out = await (await importTripIdempotent('u', new Request('http://x'), body, deps, true)).json();
    expect(out.trip.sections.transport[0].fromName).toBe('X');
    expect(out.trip.sections.transport[1].fromName).toBe('Keep');
  });

  it('a bad transport end is a 400 before any resolve', async () => {
    const resolveLinks = passLinks();
    const hotels = passHotels();
    const deps = { loadApiTrip: vi.fn(), resolveLinks, resolveHotels: hotels } as unknown as ImportDeps;
    const bad = { ...base, transport: [{ type: 'car', title: 'C', from: 'nope' }] };
    await expect(importTripIdempotent('u', new Request('http://x'), bad, deps, true)).rejects.toThrow(/^transport 1: /);
    expect(hotels).not.toHaveBeenCalled();
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
    expect(await res.json()).toEqual({ trip: { id: 't1' }, warnings: [], summary: {} });
    expect(loadApiTrip).toHaveBeenCalledWith('t1');
  });

  it('adds summary to a full body persisted before TP-0144 (no codes)', async () => {
    vi.mocked(claimKey).mockResolvedValue({
      kind: 'replay',
      statusCode: 201,
      responseJson: { trip: { id: 't1' }, warnings: [{ code: 'coords_approx', message: 'm', day: 1, place: 1 }] },
    } as never);
    const res = await importTripIdempotent('u', new Request('http://x'), {}, { loadApiTrip: vi.fn() } as unknown as ImportDeps);
    expect((await res.json()).summary).toEqual({ coords_approx: 1 });
  });
});
