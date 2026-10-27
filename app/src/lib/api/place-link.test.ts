import { describe, it, expect, vi } from 'vitest';
import { applyPlaceLink, LinkBudget, resolvePlanLinks } from './place-link';
import type { ParsedImportPlan } from './import-input';
import type { PlaceFields } from '@/lib/services/place-service';
import type { GmapsLink } from '@/lib/places/gmaps-link';
import type { PlaceSuggestion } from '@/lib/places/types';

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
const deps = (l: GmapsLink | null, s: PlaceSuggestion[] = [hit]) => ({
  readLink: vi.fn(async () => l),
  search: vi.fn(async () => s),
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
});
