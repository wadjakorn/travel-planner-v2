import { describe, it, expect, vi } from 'vitest';
import { applyPlaceLink, LinkBudget, resolvePlanLinks } from './place-link';
import type { ParsedImportPlan } from './import-input';
import type { PlaceFields } from '@/lib/services/place-service';
import type { GmapsLink } from '@/lib/places/gmaps-link';
import type { PlaceSuggestion } from '@/lib/places/types';
import type { TextSearchResult } from '@/lib/places/text-search';

const base: PlaceFields = {
  kind: 'food', status: 'confirmed', sourceUrl: null,
  name: 'Jay Fai', category: null, rating: null, reviews: null, time: null,
  duration: null, price: null, address: null, phone: null, website: null, hours: null,
  tags: [], thumb: null, note: null, lat: null, lng: null, placeIdExternal: null,
};
const ok = async () => ({ ok: true as const });
const mkBudget = (lookups?: number, consume: ConstructorParameters<typeof LinkBudget>[3] = ok) =>
  new LinkBudget('u1', lookups, undefined, consume);

const LONG = 'https://www.google.com/maps/place/X/@1,2,17z';
const SHORT = 'https://maps.app.goo.gl/abc';
const link = (o: Partial<GmapsLink> = {}): GmapsLink => ({
  name: 'Jay Fai', query: null, lat: 13.75, lng: 100.5, precision: 'exact', cid: '123', googlePlaceId: null, ...o,
});
const hit: PlaceSuggestion = {
  id: 'geoapify:1', name: 'Hit', secondary: null, address: 'Geo Addr', lat: 10, lng: 20, kind: 'food', timeZone: null,
};
// textSearch: null pins the keyless (Geoapify/Photon) path regardless of env.
const deps = (l: GmapsLink | null, s: PlaceSuggestion[] = [hit]) => ({
  readLink: vi.fn(async () => l),
  search: vi.fn(async () => s),
  textSearch: null,
});
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

describe('applyPlaceLink', () => {
  it('exact link sets coords + gcid, no warnings', async () => {
    const r = await applyPlaceLink(base, LONG, mkBudget(), deps(link()));
    expect(r.fields).toMatchObject({ lat: 13.75, lng: 100.5, placeIdExternal: 'gcid:123', name: 'Jay Fai' });
    expect(r.warnings).toEqual([]);
  });
  it('exact link > 2 km from agent coords -> link coords, coords_mismatch', async () => {
    const r = await applyPlaceLink({ ...base, lat: 13.8, lng: 100.5 }, LONG, mkBudget(), deps(link()));
    expect(r.fields.lat).toBe(13.75);
    expect(codes(r)).toEqual(['coords_mismatch']);
  });
  it('exact link near agent coords -> no mismatch', async () => {
    const r = await applyPlaceLink({ ...base, lat: 13.7501, lng: 100.5 }, LONG, mkBudget(), deps(link()));
    expect(r.warnings).toEqual([]);
  });
  it('agent coords beat a viewport link, no warnings', async () => {
    const r = await applyPlaceLink({ ...base, lat: 1, lng: 2 }, LONG, mkBudget(), deps(link({ precision: 'viewport' })));
    expect(r.fields).toMatchObject({ lat: 1, lng: 2 });
    expect(r.warnings).toEqual([]);
  });
  it('viewport link without agent coords -> coords_approx', async () => {
    const r = await applyPlaceLink(base, LONG, mkBudget(), deps(link({ precision: 'viewport' })));
    expect(r.fields.lat).toBe(13.75);
    expect(codes(r)).toEqual(['coords_approx']);
  });
  it('geocode skips Google and the first hit without coords', async () => {
    const noCoords = { ...hit, id: 'ChIJx', lat: null, lng: null };
    const d = deps(null, [noCoords, hit]);
    const r = await applyPlaceLink({ ...base, address: 'Bangkok' }, null, mkBudget(), d);
    expect(d.search).toHaveBeenCalledWith('Jay Fai, Bangkok', expect.objectContaining({ skipGoogle: true }));
    expect(r.fields).toMatchObject({ lat: 10, lng: 20 });
  });
  it('search-only link geocodes link.query; id is the link ChIJ, never the geocode id', async () => {
    const d = deps(link({ lat: null, lng: null, precision: null, cid: null, googlePlaceId: 'ChIJabc', query: 'Q text' }));
    const r = await applyPlaceLink(base, LONG, mkBudget(), d);
    expect(d.search).toHaveBeenCalledWith('Q text', expect.anything());
    expect(r.fields).toMatchObject({ lat: 10, lng: 20, placeIdExternal: 'ChIJabc', address: 'Geo Addr' });
    expect(codes(r)).toEqual(['coords_approx']);
  });
  it('no link, address -> geocodes "name, address"; placeIdExternal stays null; address kept', async () => {
    const d = deps(null);
    const r = await applyPlaceLink({ ...base, address: 'Bangkok' }, null, mkBudget(), d);
    expect(d.search).toHaveBeenCalledWith('Jay Fai, Bangkok', expect.anything());
    expect(r.fields).toMatchObject({ lat: 10, lng: 20, placeIdExternal: null, address: 'Bangkok' });
    expect(codes(r)).toEqual(['coords_approx']);
  });
  it('name only -> no search, no warnings', async () => {
    const d = deps(null);
    const r = await applyPlaceLink(base, null, mkBudget(), d);
    expect(d.search).not.toHaveBeenCalled();
    expect(r.warnings).toEqual([]);
  });
  it('kind transit with address -> no search', async () => {
    const d = deps(null);
    await applyPlaceLink({ ...base, kind: 'transit', address: 'X' }, null, mkBudget(), d);
    expect(d.search).not.toHaveBeenCalled();
  });
  it('readLink null after abort -> lookup_skipped', async () => {
    const b = mkBudget();
    const d = {
      readLink: vi.fn(async () => { vi.spyOn(b.signal, 'aborted', 'get').mockReturnValue(true); return null; }),
      search: vi.fn(async () => []),
    };
    const r = await applyPlaceLink(base, SHORT, b, d);
    expect(codes(r)).toEqual(['lookup_skipped']);
  });
  it('search [] after abort -> lookup_skipped, nothing cached', async () => {
    const b = mkBudget();
    const d = {
      readLink: vi.fn(async () => null),
      search: vi.fn(async () => { vi.spyOn(b.signal, 'aborted', 'get').mockReturnValue(true); return []; }),
    };
    const r = await applyPlaceLink({ ...base, address: 'A' }, null, b, d);
    expect(codes(r)).toEqual(['lookup_skipped']);
    expect(b.geocodeCache.size).toBe(0);
  });
  it('two concurrent identical queries -> search once', async () => {
    const b = mkBudget();
    const d = deps(null);
    await Promise.all([
      applyPlaceLink({ ...base, address: 'A' }, null, b, d),
      applyPlaceLink({ ...base, address: 'A' }, null, b, d),
    ]);
    expect(d.search).toHaveBeenCalledTimes(1);
  });
  it('same query twice sequentially -> search once', async () => {
    const b = mkBudget();
    const d = deps(null);
    await applyPlaceLink({ ...base, address: 'A' }, null, b, d);
    await applyPlaceLink({ ...base, address: 'A' }, null, b, d);
    expect(d.search).toHaveBeenCalledTimes(1);
  });
  it('short link times out then geocode skipped -> exactly one lookup_skipped', async () => {
    const b = mkBudget();
    const d = {
      readLink: vi.fn(async () => { vi.spyOn(b.signal, 'aborted', 'get').mockReturnValue(true); return null; }),
      search: vi.fn(async () => [hit]),
    };
    const r = await applyPlaceLink(base, SHORT, b, d);
    expect(codes(r)).toEqual(['lookup_skipped']);
  });
  it('no link, agent coords -> no search', async () => {
    const d = deps(null);
    await applyPlaceLink({ ...base, address: 'A', lat: 1, lng: 2 }, null, mkBudget(), d);
    expect(d.search).not.toHaveBeenCalled();
  });
  it('agent placeIdExternal is never overwritten', async () => {
    const r = await applyPlaceLink({ ...base, placeIdExternal: 'ChIJmine' }, LONG, mkBudget(), deps(link()));
    expect(r.fields.placeIdExternal).toBe('ChIJmine');
  });
  it('unresolvable short link with no geocode hit -> [url_unresolved]', async () => {
    const r = await applyPlaceLink(base, SHORT, mkBudget(), deps(null, []));
    expect(codes(r)).toEqual(['url_unresolved']);
  });
  it('non-Google URL with address -> [url_unsupported, coords_approx]', async () => {
    const r = await applyPlaceLink({ ...base, address: 'A' }, 'https://example.com/x', mkBudget(), deps(null));
    expect(codes(r)).toEqual(['url_unsupported', 'coords_approx']);
  });
  it('LinkBudget(userId, 0) -> short link lookup_skipped, readLink not called', async () => {
    const d = deps(link());
    const r = await applyPlaceLink(base, SHORT, mkBudget(0), d);
    expect(d.readLink).not.toHaveBeenCalled();
    expect(codes(r)).toEqual(['lookup_skipped']);
  });
  it('daily geocode bucket exhausted -> lookup_skipped, search not called', async () => {
    const d = deps(null);
    const consume = async () => ({ ok: false as const, retryAfter: 1, limit: 300 });
    const r = await applyPlaceLink({ ...base, address: 'A' }, null, mkBudget(undefined, consume), d);
    expect(d.search).not.toHaveBeenCalled();
    expect(codes(r)).toEqual(['lookup_skipped']);
  });
  it('limiter throws -> geocode still runs', async () => {
    const d = deps(null);
    const consume = async () => { throw new Error('db down'); };
    const r = await applyPlaceLink({ ...base, address: 'A' }, null, mkBudget(undefined, consume), d);
    expect(d.search).toHaveBeenCalledTimes(1);
    expect(r.fields.lat).toBe(10);
  });

  // --- TP-0039: query/near resolution --------------------------------------
  const far: PlaceSuggestion = { ...hit, id: 'geoapify:far', lat: 10, lng: 20 };
  const close: PlaceSuggestion = { ...hit, id: 'geoapify:close', lat: 50, lng: 60 };

  it('query (no coords, no address) geocodes the query text -> coords_approx', async () => {
    const d = deps(null, [far]);
    const r = await applyPlaceLink(base, null, mkBudget(), d, { query: 'Jay Fai Bangkok', near: null });
    expect(d.search).toHaveBeenCalledWith('Jay Fai Bangkok', expect.objectContaining({ skipGoogle: true }));
    expect(r.fields).toMatchObject({ lat: 10, lng: 20 });
    expect(codes(r)).toEqual(['coords_approx']);
  });

  it('query + near -> picks the hit nearest the bias', async () => {
    const d = deps(null, [far, close]);
    const r = await applyPlaceLink(base, null, mkBudget(), d, { query: 'X', near: { lat: 49, lng: 59 } });
    expect(r.fields).toMatchObject({ lat: 50, lng: 60 });
    expect(codes(r)).toEqual(['coords_approx']);
  });

  it('query outranks the name/address fallback as the search text', async () => {
    const d = deps(null, [far]);
    await applyPlaceLink({ ...base, address: 'Somewhere' }, null, mkBudget(), d, { query: 'Explicit Q', near: null });
    expect(d.search).toHaveBeenCalledWith('Explicit Q', expect.anything());
  });

  it('unresolved query -> coords null + place_unresolved', async () => {
    const d = deps(null, []);
    const r = await applyPlaceLink(base, null, mkBudget(), d, { query: 'no such place', near: null });
    expect(r.fields).toMatchObject({ lat: null, lng: null });
    expect(codes(r)).toEqual(['place_unresolved']);
  });

  it('query lookup past the daily cap -> lookup_skipped, not place_unresolved', async () => {
    const d = deps(null, []);
    const consume = async () => ({ ok: false as const, retryAfter: 1, limit: 300 });
    const r = await applyPlaceLink(base, null, mkBudget(undefined, consume), d, { query: 'X', near: null });
    expect(d.search).not.toHaveBeenCalled();
    expect(codes(r)).toEqual(['lookup_skipped']);
  });
});

// --- TP-0140: Google Text Search path + real near bias ---------------------
describe('applyPlaceLink: Google Text Search (TP-0140)', () => {
  const gHit: TextSearchResult = { placeId: 'ChIJcastle', name: 'Matsuyama Castle', lat: 33.8456, lng: 132.7656, address: '1 Marunouchi, Matsuyama' };
  const gDeps = (r: TextSearchResult[] | Error = [gHit], s: PlaceSuggestion[] = [hit]) => ({
    readLink: vi.fn(async () => null),
    search: vi.fn(async () => s),
    textSearch: vi.fn(async () => { if (r instanceof Error) throw r; return r; }),
  });
  const near = { lat: 33.84, lng: 132.77 };
  const buckets = (c: ReturnType<typeof vi.fn>) => c.mock.calls.map((a) => a[0]);

  it('key configured: resolves via Text Search with near as locationBias; exact coords + placeIdExternal, no coords_approx', async () => {
    const d = gDeps();
    const r = await applyPlaceLink(base, null, mkBudget(), d, { query: 'Matsuyama Castle', near });
    expect(d.textSearch).toHaveBeenCalledWith('Matsuyama Castle', { near }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(d.search).not.toHaveBeenCalled();
    expect(r.fields).toMatchObject({ lat: 33.8456, lng: 132.7656, placeIdExternal: 'ChIJcastle', address: '1 Marunouchi, Matsuyama' });
    expect(r.warnings).toEqual([]);
  });

  it('takes the first (relevance-ranked, already biased) Google hit, not the nearest', async () => {
    const closer = { ...gHit, placeId: 'ChIJcafe', lat: 33.84, lng: 132.77 };
    const r = await applyPlaceLink(base, null, mkBudget(), gDeps([gHit, closer]), { query: 'Matsuyama Castle', near });
    expect(r.fields.placeIdExternal).toBe('ChIJcastle');
  });

  it('consumes the shared places:search bucket (200/day), not the geocode bucket', async () => {
    const consume = vi.fn(async () => ({ ok: true as const }));
    await applyPlaceLink(base, null, mkBudget(undefined, consume), gDeps(), { query: 'Q', near: null });
    expect(consume).toHaveBeenCalledWith('places:search:u1', 200, 86_400);
    expect(buckets(consume)).toEqual(['places:search:u1']);
  });

  it('never overwrites an agent/link placeIdExternal', async () => {
    const r = await applyPlaceLink({ ...base, placeIdExternal: 'ChIJmine' }, null, mkBudget(), gDeps(), { query: 'Q', near: null });
    expect(r.fields.placeIdExternal).toBe('ChIJmine');
  });

  it('Google returns no match -> place_unresolved, no fallback lookup', async () => {
    const d = gDeps([]);
    const r = await applyPlaceLink(base, null, mkBudget(), d, { query: 'nowhere', near: null });
    expect(d.search).not.toHaveBeenCalled();
    expect(codes(r)).toEqual(['place_unresolved']);
  });

  it('places:search quota exhausted -> falls back to Geoapify/Photon with near as a real bias, coords_approx', async () => {
    const consume = vi.fn(async (k: string) =>
      k.startsWith('places:search:') ? { ok: false as const, retryAfter: 60, limit: 200 } : { ok: true as const });
    const d = gDeps();
    const r = await applyPlaceLink(base, null, mkBudget(undefined, consume), d, { query: 'Q', near });
    expect(d.textSearch).not.toHaveBeenCalled();
    expect(d.search).toHaveBeenCalledWith('Q', expect.objectContaining({
      skipGoogle: true, bias: { kind: 'point', lat: 33.84, lng: 132.77, radius: 50_000 },
    }));
    expect(buckets(consume)).toEqual(['places:search:u1', 'geocode:u1']);
    expect(r.fields).toMatchObject({ lat: 10, lng: 20, placeIdExternal: null });
    expect(codes(r)).toEqual(['coords_approx']);
  });

  it('Google error -> fallback, and Google stays off for the rest of the import', async () => {
    const d = gDeps(new Error('503'));
    const b = mkBudget();
    const r1 = await applyPlaceLink(base, null, b, d, { query: 'A', near });
    const r2 = await applyPlaceLink(base, null, b, d, { query: 'B', near });
    expect(d.textSearch).toHaveBeenCalledTimes(1);
    expect(d.search).toHaveBeenCalledTimes(2);
    expect(codes(r1)).toEqual(['coords_approx']);
    expect(codes(r2)).toEqual(['coords_approx']);
  });

  it('no key (textSearch null) -> Geoapify/Photon with bias; no places:search unit spent', async () => {
    const consume = vi.fn(async () => ({ ok: true as const }));
    const d = deps(null, [hit]);
    await applyPlaceLink(base, null, mkBudget(undefined, consume), d, { query: 'Q', near });
    expect(d.search).toHaveBeenCalledWith('Q', expect.objectContaining({ bias: expect.objectContaining({ kind: 'point', lat: 33.84 }) }));
    expect(buckets(consume)).toEqual(['geocode:u1']);
  });

  it('no near -> fallback search gets no bias', async () => {
    const d = deps(null, [hit]);
    await applyPlaceLink(base, null, mkBudget(), d, { query: 'Q', near: null });
    expect(d.search).toHaveBeenCalledWith('Q', expect.objectContaining({ bias: null }));
  });

  it('per-import lookup cap still applies to the Google path', async () => {
    const d = gDeps();
    const r = await applyPlaceLink(base, null, mkBudget(0), d, { query: 'Q', near: null });
    expect(d.textSearch).not.toHaveBeenCalled();
    expect(codes(r)).toEqual(['lookup_skipped']);
  });

  it('same query with a different near is a separate lookup (bias is part of the cache key)', async () => {
    const d = gDeps();
    const b = mkBudget();
    await applyPlaceLink(base, null, b, d, { query: 'Station', near: { lat: 34.7, lng: 135.5 } });
    await applyPlaceLink(base, null, b, d, { query: 'Station', near: { lat: 33.8, lng: 132.7 } });
    await applyPlaceLink(base, null, b, d, { query: 'Station', near: { lat: 33.8, lng: 132.7 } });
    expect(d.textSearch).toHaveBeenCalledTimes(2);
  });
});

describe('resolvePlanLinks', () => {
  const mkPlan = (places: PlaceFields[]): ParsedImportPlan => ({
    trip: { title: 'T', subtitle: null, startDate: null, endDate: null, cover: null },
    days: [{ date: null, places }],
    hotels: [],
  });

  it('60 short links: 50 resolve, 10 get lookup_skipped from place 51; input untouched', async () => {
    const places = Array.from({ length: 60 }, (_, i) => ({ ...base, name: `P${i}` }));
    const plan = mkPlan(places);
    const links = [places.map(() => SHORT)];
    const before = structuredClone(plan);
    const r = await resolvePlanLinks('u1', plan, links, {
      readLink: async () => link(),
      budget: mkBudget(),
    });
    expect(plan).toEqual(before);
    expect(r.plan).not.toBe(plan);
    expect(r.plan.days[0].places.slice(0, 50).every((p) => p.lat === 13.75)).toBe(true);
    expect(r.plan.days[0].places.slice(50).every((p) => p.lat === null)).toBe(true);
    expect(r.warnings).toHaveLength(10);
    expect(r.warnings[0]).toMatchObject({ day: 1, place: 51, code: 'lookup_skipped' });
    expect(r.warnings.every((w) => w.code === 'lookup_skipped')).toBe(true);
  });

  it('deadline: every place gets exactly lookup_skipped and the call returns promptly', async () => {
    const waitAbort = <T,>(v: T) => (_: unknown, o?: { signal?: AbortSignal }) =>
      new Promise<T>((res) => o?.signal?.addEventListener('abort', () => res(v)));
    const places = [{ ...base }, { ...base, name: 'B' }, { ...base, name: 'C', address: 'Somewhere' }];
    const t0 = Date.now();
    const r = await resolvePlanLinks('u', mkPlan(places), [[SHORT, SHORT, null]], {
      readLink: waitAbort<GmapsLink | null>(null) as never,
      search: waitAbort<PlaceSuggestion[]>([]) as never,
      budget: new LinkBudget('u', 50, 50, ok),
    });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.warnings.map((w) => [w.day, w.place, w.code])).toEqual([
      [1, 1, 'lookup_skipped'],
      [1, 2, 'lookup_skipped'],
      [1, 3, 'lookup_skipped'],
    ]);
  });

  it('name-only place with no link: untouched, no warning', async () => {
    const d = deps(null);
    const r = await resolvePlanLinks('u1', mkPlan([base]), [[null]], { ...d, budget: mkBudget() });
    expect(d.search).not.toHaveBeenCalled();
    expect(r.warnings).toEqual([]);
  });

  it('query places share the per-import budget: 2nd resolve past the cap -> lookup_skipped', async () => {
    const d = deps(null, [hit]);
    const extras = [[{ query: 'A', near: null }, { query: 'B', near: null }]];
    const r = await resolvePlanLinks(
      'u1',
      mkPlan([{ ...base, name: 'P0' }, { ...base, name: 'P1' }]),
      [[null, null]],
      { ...d, budget: mkBudget(1) },
      extras,
    );
    expect(d.search).toHaveBeenCalledTimes(1);
    expect(r.plan.days[0].places[0]).toMatchObject({ lat: 10, lng: 20 });
    expect(r.plan.days[0].places[1]).toMatchObject({ lat: null, lng: null });
    expect(r.warnings).toEqual([
      expect.objectContaining({ day: 1, place: 1, code: 'coords_approx' }),
      expect.objectContaining({ day: 1, place: 2, code: 'lookup_skipped' }),
    ]);
  });

  it('query makes an address-less place geocodable; near biases the result', async () => {
    const d = deps(null, [hit]);
    const extras = [[{ query: 'Wat Pho', near: { lat: 13.7, lng: 100.4 } }]];
    const r = await resolvePlanLinks('u1', mkPlan([base]), [[null]], { ...d, budget: mkBudget() }, extras);
    expect(d.search).toHaveBeenCalledWith('Wat Pho', expect.objectContaining({ skipGoogle: true }));
    expect(r.plan.days[0].places[0]).toMatchObject({ lat: 10, lng: 20 });
    expect(r.warnings).toEqual([expect.objectContaining({ day: 1, place: 1, code: 'coords_approx' })]);
  });
  // TP-0058: dryRun and commit are separate requests with separate budgets, so
  // resolving the same queries twice double-counts the daily geocode cap — and
  // at the cap edge the commit can lose coords the preview showed. The supported
  // round trip: the agent copies lat/lng from the dryRun preview into the commit
  // body. Pinned here: echoed coords never geocode again, even past the cap.
  it('commit that echoes dryRun coords makes no lookups, even with the daily cap exhausted', async () => {
    const extras = [[{ query: 'Wat Pho', near: null }]];
    const preview = await resolvePlanLinks('u1', mkPlan([base]), [[null]], { ...deps(null, [hit]), budget: mkBudget() }, extras);
    const resolved = preview.plan.days[0].places[0];
    expect(resolved).toMatchObject({ lat: 10, lng: 20 });

    const commitDeps = deps(null, [hit]);
    const capHit = vi.fn(async () => ({ ok: false as const, retryAfter: 60 }));
    const commit = await resolvePlanLinks(
      'u1',
      mkPlan([{ ...base, lat: resolved.lat, lng: resolved.lng, address: resolved.address }]),
      [[null]],
      { ...commitDeps, budget: mkBudget(undefined, capHit as never) },
      extras,
    );
    expect(commitDeps.search).not.toHaveBeenCalled();
    expect(capHit).not.toHaveBeenCalled();
    expect(commit.plan.days[0].places[0]).toMatchObject({ lat: 10, lng: 20, address: 'Geo Addr' });
    expect(commit.warnings).toEqual([]);
  });

  // TP-0140: the real 39-place run hit the 20 s deadline at ~place 33. Pin that
  // lookups actually run 5-wide end to end (budget, limiter, search).
  it('runs lookups PLAN_CONCURRENCY (5) wide end to end', async () => {
    let inFlight = 0;
    let peak = 0;
    const textSearch = vi.fn(async (q: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      return [{ placeId: `ChIJ${q}`, name: q, lat: 1, lng: 2, address: null }];
    });
    const n = 20;
    const places = Array.from({ length: n }, (_, i) => ({ ...base, name: `P${i}` }));
    const extras = [places.map((_, i) => ({ query: `Q${i}`, near: null }))];
    const t0 = Date.now();
    const r = await resolvePlanLinks('u1', mkPlan(places), [places.map(() => null)], {
      readLink: async () => null, search: async () => [], textSearch, budget: mkBudget(),
    }, extras);
    expect(textSearch).toHaveBeenCalledTimes(n);
    expect(peak).toBe(5);
    // Serial would be >= 400 ms; 5-wide is ~4 x 20 ms.
    expect(Date.now() - t0).toBeLessThan(300);
    expect(r.plan.days[0].places.every((p) => p.lat === 1)).toBe(true);
  });

  it('E-city fixture: 39 query+near places resolve via Text Search, all exact, one quota unit each', async () => {
    const names = [
      'Matsuyama Castle', 'Dogo Onsen', 'Kaiyukan', 'Universal Studios Japan', 'Ritsurin Garden',
      ...Array.from({ length: 34 }, (_, i) => `Spot ${i}`),
    ];
    const consume = vi.fn(async () => ({ ok: true as const }));
    const textSearch = vi.fn(async (q: string, o: { near?: { lat: number; lng: number } | null } = {}) =>
      o.near ? [{ placeId: `ChIJ${q}`, name: q, lat: o.near.lat + 0.001, lng: o.near.lng, address: `${q} addr` }] : []);
    const places = names.map((name) => ({ ...base, name }));
    const extras = [names.map((q, i) => ({ query: q, near: { lat: 33 + i * 0.01, lng: 132 } }))];
    const r = await resolvePlanLinks('u1', mkPlan(places), [names.map(() => null)], {
      readLink: async () => null, search: async () => [], textSearch, budget: mkBudget(undefined, consume),
    }, extras);
    const resolved = r.plan.days[0].places.filter((p) => p.lat !== null && p.placeIdExternal?.startsWith('ChIJ'));
    expect(resolved).toHaveLength(39);
    expect(r.warnings).toEqual([]);
    expect(consume).toHaveBeenCalledTimes(39);
    expect(consume.mock.calls.every((c) => (c as unknown[])[0] === 'places:search:u1')).toBe(true);
  });
});
