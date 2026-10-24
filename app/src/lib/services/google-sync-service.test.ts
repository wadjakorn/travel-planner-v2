import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readMapsConfig } from '@/lib/maps/config';
import refreshFixture from '@/lib/places/__fixtures__/google-details-refresh.json';
import { GoogleHttpError } from '@/lib/places/google';
import { mergeGoogleRefresh, type RefreshPatch } from '@/lib/places/google-sync';
import { __resetGoogleState, noteGoogleFailure, searchPlaces } from '@/lib/places/search';
import {
  refreshOne,
  refreshPlaceFromGoogle,
  runGoogleResync,
  type RefreshDeps,
  type ResyncCandidate,
} from './google-sync-service';

vi.mock('@/lib/services/access', () => ({
  resolvePlaceWrite: vi.fn(async () => ({ tripId: 't', dayId: 'd', idx: 0 })),
}));

const BASE_ENV = {
  MAPS_PROVIDER: 'google',
  GOOGLE_MAPS_BROWSER_KEY: 'B',
  GOOGLE_MAPS_MAP_ID: 'M',
  NODE_ENV: 'test',
};
const gcfg = readMapsConfig({ ...BASE_ENV, GOOGLE_MAPS_API_KEY: 'S', GOOGLE_MAPS_URL_SIGNING_SECRET: 'X' });
const fakeCfg = readMapsConfig({ ...BASE_ENV, GOOGLE_PLACES_FAKE: '1' });
const openCfg = readMapsConfig({});

const NOW = new Date('2026-10-23T00:00:00Z');
const UPDATED = new Date('2026-10-01T00:00:00Z');

const row = (id: string, over: Partial<ResyncCandidate> = {}): ResyncCandidate => ({
  id: `p-${id}`,
  updatedAt: UPDATED,
  name: 'Jay Fai',
  address: 'Old Rd',
  lat: 13.75,
  lng: 100.5,
  phone: null,
  website: null,
  rating: null,
  reviews: null,
  hours: null,
  ratingSyncedAt: null,
  hoursSyncedAt: null,
  googleSnapshot: null,
  googleSyncedAt: null,
  googleStatus: null,
  placeIdExternal: id,
  ...over,
});

const okBody = (id: string) => ({
  id,
  displayName: { text: 'Raan Jay Fai' },
  formattedAddress: 'New Rd',
  location: { latitude: 13.7526, longitude: 100.5048 },
  businessStatus: 'OPERATIONAL',
  rating: 4.1,
  userRatingCount: 10,
});

type Reply = number | 'throw' | 'noloc' | 'ok';
// Google fetch keyed by the requested place id.
function googleFetch(replies: Record<string, Reply> = {}) {
  return vi.fn(async (input: URL | RequestInfo) => {
    const u = new URL(String(input));
    const id = decodeURIComponent(u.pathname.slice('/v1/places/'.length));
    const r = replies[id] ?? 'ok';
    if (r === 'throw') throw new TypeError('fetch failed');
    if (r === 'noloc') return new Response(JSON.stringify({ id, displayName: { text: 'X' } }));
    if (r === 'ok') return new Response(JSON.stringify(okBody(id)));
    return new Response('{}', { status: r });
  });
}

const okConsume = () => vi.fn(async () => ({ ok: true as const }));

function harness(rows: ResyncCandidate[], over: Partial<RefreshDeps> = {}) {
  const select = vi.fn(async () => rows);
  const write = vi.fn<(id: string, patch: RefreshPatch, rowUpdatedAt: Date) => Promise<boolean>>(async () => true);
  const deps: RefreshDeps = {
    now: () => NOW,
    config: gcfg,
    fetchImpl: googleFetch() as unknown as typeof fetch,
    consume: okConsume(),
    select,
    write,
    ...over,
  };
  return { deps, select, write };
}

const ZERO = { refreshed: 0, notFound: 0, invalid: 0, skipped: 0, failed: 0 };

beforeEach(() => __resetGoogleState());

describe('runGoogleResync', () => {
  it('disabled config does not query', async () => {
    const { deps, select } = harness([row('ChIJa')], { config: openCfg });
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, stopped: 'disabled' });
    expect(select).not.toHaveBeenCalled();
  });

  it('happy path refreshes every candidate once', async () => {
    const rows = [row('ChIJa'), row('ChIJb'), row('ChIJc')];
    const consume = okConsume();
    const { deps, select, write } = harness(rows, { consume });
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, refreshed: 3, stopped: null });
    expect(select).toHaveBeenCalledWith(NOW, 20);
    expect(consume).toHaveBeenCalledTimes(3);
    for (const c of consume.mock.calls) expect(c).toEqual(['gplaces:refresh', 20, 86400]);
    expect(write).toHaveBeenCalledTimes(3);
    rows.forEach((r, i) => {
      expect(write.mock.calls[i][0]).toBe(r.id);
      expect(write.mock.calls[i][2]).toBe(UPDATED);
    });
    // The patch is exactly the merge result for that row.
    const expected = mergeGoogleRefresh(
      rows[0],
      {
        id: 'ChIJa', name: 'Raan Jay Fai', address: 'New Rd', lat: 13.7526, lng: 100.5048, phone: null,
        website: null, hours: null, rating: 4.1, reviews: 10, businessStatus: 'OPERATIONAL',
      },
      NOW,
    );
    expect(write.mock.calls[0][1]).toEqual(expected);
  });

  it('a 403 stops the run with no further fetch, and search then skips Google', async () => {
    const fetchImpl = googleFetch({ ChIJb: 403 });
    const { deps } = harness([row('ChIJa'), row('ChIJb'), row('ChIJc')], { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, refreshed: 1, stopped: 'breaker' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const searchFetch = vi.fn<(input: URL | RequestInfo) => Promise<Response>>(async () => new Response(JSON.stringify({ features: [] })));
    await searchPlaces('jay fai', {
      config: gcfg, fetchImpl: searchFetch as unknown as typeof fetch, consume: okConsume(), now: () => NOW.getTime(),
    });
    expect(searchFetch.mock.calls.some(([u]) => String(u).includes('googleapis'))).toBe(false);
  });

  it('a timeout on row 1 trips the breaker', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    const { deps } = harness([row('ChIJa'), row('ChIJb')], { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, stopped: 'breaker' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('a denied consume stops the run', async () => {
    const consume = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, retryAfter: 3600, limit: 20 })
      .mockResolvedValue({ ok: true });
    const fetchImpl = googleFetch();
    const { deps } = harness([row('ChIJa'), row('ChIJb'), row('ChIJc')], {
      consume, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, refreshed: 1, stopped: 'budget' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('an already-open breaker consumes nothing', async () => {
    noteGoogleFailure(new GoogleHttpError(403), NOW.getTime());
    const consume = okConsume();
    const { deps } = harness([row('ChIJa')], { consume });
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, stopped: 'breaker' });
    expect(consume).not.toHaveBeenCalled();
  });

  it('mixed 404 / 500 / 200', async () => {
    const fetchImpl = googleFetch({ ChIJa: 404, ChIJb: 500 });
    const { deps, write } = harness([row('ChIJa'), row('ChIJb'), row('ChIJc')], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, refreshed: 1, notFound: 1, failed: 1, stopped: null });
    expect(write.mock.calls.map((c) => c[0])).toEqual(['p-ChIJa', 'p-ChIJc']);
    expect(write.mock.calls[0][1]).toEqual({ googleStatus: 'NOT_FOUND' });
  });

  it('deterministic failures mark INVALID', async () => {
    const fetchImpl = googleFetch({ ChIJa: 400, ChIJb: 'noloc' });
    const consume = okConsume();
    const { deps, write } = harness([row('ChIJa'), row('ChIJb'), row('a/b')], {
      consume, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, invalid: 3, stopped: null });
    expect(write).toHaveBeenCalledTimes(3);
    for (const c of write.mock.calls) expect(c[1]).toEqual({ googleStatus: 'INVALID', googleSyncedAt: NOW });
    expect(consume).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('transient failures write nothing', async () => {
    const fetchImpl = googleFetch({ ChIJa: 500, ChIJb: 503, ChIJc: 'throw', ChIJd: 'ok' });
    const { deps, write } = harness([row('ChIJa'), row('ChIJb'), row('ChIJc'), row('ChIJd')], {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, failed: 2, stopped: 'breaker' });
    expect(write).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('a lost update is skipped and the run continues', async () => {
    const { deps, write } = harness([row('ChIJa'), row('ChIJb'), row('ChIJc')]);
    write.mockResolvedValueOnce(false);
    expect(await runGoogleResync(deps)).toEqual({ ...ZERO, refreshed: 2, skipped: 1, stopped: null });
  });
});

describe('refreshOne', () => {
  it('manual source uses the manual bucket; default is the cron bucket', async () => {
    const c1 = okConsume();
    await refreshOne(row('ChIJa'), { ...harness([]).deps, consume: c1, source: 'manual' });
    expect(c1).toHaveBeenCalledWith('gplaces:refresh:manual', 5, 86400);
    const c2 = okConsume();
    await refreshOne(row('ChIJa'), { ...harness([]).deps, consume: c2 });
    expect(c2).toHaveBeenCalledWith('gplaces:refresh', 20, 86400);
  });

  it('fails open when the limiter throws', async () => {
    const fetchImpl = googleFetch();
    const consume = vi.fn(async () => {
      throw new Error('db down');
    });
    const { deps } = harness([], { consume, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await refreshOne(row('ChIJa'), deps)).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('prefixed or empty id is an error with no consume or write', async () => {
    const consume = okConsume();
    const { deps, write } = harness([], { consume });
    expect(await refreshOne(row('geoapify:x'), deps)).toBe('error');
    expect(await refreshOne(row('', { placeIdExternal: '' }), deps)).toBe('error');
    expect(consume).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('disabled config is unavailable', async () => {
    const { deps } = harness([], { config: openCfg });
    expect(await refreshOne(row('ChIJa'), deps)).toBe('unavailable');
  });

  it('fake config skips the limiter and serves the refresh fixture', async () => {
    const consume = okConsume();
    const fetchImpl = vi.fn();
    const { deps, write } = harness([], { config: fakeCfg, consume, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = row('ChIJsomeId', { placeIdExternal: 'ChIJsomeId' });
    expect(await refreshOne(r, deps)).toBe('ok');
    expect(consume).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    const patch = write.mock.calls[0][1];
    expect(patch.googleStatus).toBe(refreshFixture.businessStatus);
    expect('placeIdExternal' in patch).toBe(false);

    expect(await refreshOne(row('ChIJfakeClosed0001'), deps)).toBe('ok');
    expect(write.mock.calls[1][1].googleStatus).toBe('CLOSED_TEMPORARILY');
  });

  it('language follows the snapshot name (Thai stays Thai)', async () => {
    const fetchImpl = googleFetch();
    const { deps } = harness([], { fetchImpl: fetchImpl as unknown as typeof fetch });
    const snap = (name: string) => ({ name, address: null, lat: 13.75, lng: 100.5 });
    await refreshOne(row('ChIJa', { name: 'Jay Fai', googleSnapshot: snap('ร้านเจ๊ไฝ') }), deps);
    await refreshOne(row('ChIJb', { name: 'ร้านเจ๊ไฝ', googleSnapshot: snap('Jay Fai') }), deps);
    await refreshOne(row('ChIJc', { name: 'ร้านเจ๊ไฝ', googleSnapshot: snap('') }), deps);
    const langs = fetchImpl.mock.calls.map(([u]) => new URL(String(u)).searchParams.get('languageCode'));
    expect(langs).toEqual(['th', 'en', 'th']);
  });
});

describe('refreshPlaceFromGoogle', () => {
  const manual = (over: Partial<RefreshDeps> & { allow?: (u: string) => Promise<boolean> } = {}) => {
    const fetchImpl = googleFetch();
    const consume = okConsume();
    const h = harness([], { fetchImpl: fetchImpl as unknown as typeof fetch, consume });
    const load = vi.fn(async (id: string) => row('ChIJa', { id }));
    const deps = { ...h.deps, load, allow: async () => true, ...over };
    return { deps, fetchImpl, consume, write: h.write, load };
  };

  it('per-user limit denies first', async () => {
    const { deps, fetchImpl } = manual({ allow: async () => false });
    expect(await refreshPlaceFromGoogle('u', 'p1', deps)).toBe('limit');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('missing row is an error with no consume or fetch', async () => {
    const { deps, fetchImpl, consume } = manual({ load: async () => null });
    expect(await refreshPlaceFromGoogle('u', 'p1', deps)).toBe('error');
    expect(consume).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('NOT_FOUND and INVALID rows short-circuit', async () => {
    const a = manual({ load: async () => row('ChIJa', { googleStatus: 'NOT_FOUND' }) });
    expect(await refreshPlaceFromGoogle('u', 'p1', a.deps)).toBe('not_found');
    expect(a.fetchImpl).not.toHaveBeenCalled();
    const b = manual({ load: async () => row('ChIJa', { googleStatus: 'INVALID' }) });
    expect(await refreshPlaceFromGoogle('u', 'p1', b.deps)).toBe('invalid');
    expect(b.fetchImpl).not.toHaveBeenCalled();
  });

  it('non-Google id is an error', async () => {
    const { deps } = manual({ load: async () => row('osm:W7') });
    expect(await refreshPlaceFromGoogle('u', 'p1', deps)).toBe('error');
  });

  it('happy path writes once on the manual bucket', async () => {
    const { deps, write, consume, load } = manual();
    expect(await refreshPlaceFromGoogle('u', 'p1', deps)).toBe('ok');
    expect(load).toHaveBeenCalledWith('p1');
    expect(write).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith('gplaces:refresh:manual', 5, 86400);
  });
});
