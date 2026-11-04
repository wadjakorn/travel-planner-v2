import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { LinkBudget } from './place-link';
import { resolveTransportEnd, prepareTransportCreate, patchTransport } from './transport-link';
import { ServiceError } from '@/lib/services/service-error';
import type { TransportEndInput } from './transport-input';
import type { GmapsLink } from '@/lib/places/gmaps-link';
import type { PlaceSuggestion } from '@/lib/places/types';

const ok = async () => ({ ok: true as const });
const mkBudget = () => new LinkBudget('u1', undefined, undefined, ok);
const hit: PlaceSuggestion = {
  id: 'geoapify:kix', name: 'KIX', secondary: null, address: 'Osaka', lat: 34.43, lng: 135.24, kind: 'sight', timeZone: null,
};
// Real applyPlaceLink; only the read/search deps are faked (no network).
const deps = (l: GmapsLink | null = null, s: PlaceSuggestion[] = [hit]) => ({
  readLink: vi.fn(async () => l),
  search: vi.fn(async () => s),
  textSearch: null,
});
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);
const allow = vi.fn(async () => undefined);
const legacy = { type: 'flight', title: 'BKK-KIX', fromCode: 'BKK', fromName: 'Suvarnabhumi', toCode: 'KIX', toName: 'Kansai' };
const empty: TransportEndInput = {
  name: null, lat: null, lng: null, placeId: null, googleMapsUrl: null, query: null, near: null,
};

describe('resolveTransportEnd', () => {
  it('name alone makes no lookup (R7)', async () => {
    const d = deps();
    const r = await resolveTransportEnd({ ...empty, name: 'BKK' }, mkBudget(), d);
    expect(r.lat).toBeNull();
    expect(d.search).not.toHaveBeenCalled();
    expect(d.readLink).not.toHaveBeenCalled();
  });
});

describe('prepareTransportCreate', () => {
  it('legacy body makes no lookup', async () => {
    const d = deps();
    const r = await prepareTransportCreate('u', 't', legacy, { authorize: allow, budget: mkBudget(), linkDeps: d });
    expect(d.readLink).not.toHaveBeenCalled();
    expect(d.search).not.toHaveBeenCalled();
    expect(r.body).not.toHaveProperty('from');
    expect(r.body).not.toHaveProperty('to');
    expect(r.body.fromLat).toBeUndefined();
    expect(codes(r)).toEqual(['transport_without_day']);
    expect(r.warnings[0]).not.toHaveProperty('path');
  });
  it('explicit coords are stored without lookup and name labels fromName', async () => {
    const d = deps();
    const r = await prepareTransportCreate(
      'u', 't', { type: 'flight', title: 'x', from: { name: 'BKK', lat: 13.69, lng: 100.75 } },
      { authorize: allow, budget: mkBudget(), linkDeps: d },
    );
    expect(r.body).toMatchObject({ fromLat: 13.69, fromLng: 100.75, fromName: 'BKK' });
    expect(d.search).not.toHaveBeenCalled();
    expect(d.readLink).not.toHaveBeenCalled();
  });
  it('query is searched and the hit becomes the to-end', async () => {
    const d = deps();
    const r = await prepareTransportCreate(
      'u', 't', { type: 'flight', title: 'x', to: { query: 'Kansai International Airport' } },
      { authorize: allow, budget: mkBudget(), linkDeps: d },
    );
    expect(d.search).toHaveBeenCalled();
    expect(r.body).toMatchObject({ toLat: 34.43, toLng: 135.24, toPlaceId: null });
  });
  it('a Text Search hit stores its place id', async () => {
    const d = {
      readLink: vi.fn(async () => null),
      search: vi.fn(async () => []),
      textSearch: vi.fn(async () => [{ placeId: 'ChIJkix', name: 'KIX', lat: 34.43, lng: 135.24, address: 'Osaka' }]),
    } as never;
    const r = await prepareTransportCreate(
      'u', 't', { type: 'flight', title: 'x', to: { query: 'Kansai International Airport' } },
      { authorize: allow, budget: mkBudget(), linkDeps: d },
    );
    expect(r.body).toMatchObject({ toLat: 34.43, toLng: 135.24, toPlaceId: 'ChIJkix' });
  });
  it('to: null clears the to-end', async () => {
    const r = await prepareTransportCreate('u', 't', { ...legacy, to: null }, { authorize: allow, budget: mkBudget(), linkDeps: deps() });
    expect(r.body).toMatchObject({ toLat: null, toLng: null, toPlaceId: null });
    expect(r.body).not.toHaveProperty('to');
  });
  it('explicit fromName wins over from.name', async () => {
    const r = await prepareTransportCreate(
      'u', 't', { ...legacy, from: { name: 'BKK', lat: 1, lng: 2 } },
      { authorize: allow, budget: mkBudget(), linkDeps: deps() },
    );
    expect(r.body.fromName).toBe('Suvarnabhumi');
  });
  it('bad type is 400 with zero lookups', async () => {
    const d = deps();
    await expect(
      prepareTransportCreate('u', 't', { type: 'bus', title: 'x', to: { query: 'q' } }, { authorize: allow, budget: mkBudget(), linkDeps: d }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(d.search).not.toHaveBeenCalled();
    expect(d.readLink).not.toHaveBeenCalled();
  });
  it('search miss leaves coords null and warns with /to path', async () => {
    const r = await prepareTransportCreate(
      'u', 't', { type: 'flight', title: 'x', to: { query: 'nowhere' } },
      { authorize: allow, budget: mkBudget(), linkDeps: deps(null, []) },
    );
    expect(r.body.toLat).toBeNull();
    const w = r.warnings.find((x) => x.path === '/to');
    expect(w).toBeDefined();
    expect(w!.code).toBe('place_unresolved');
  });
  it('unreadable maps link never falls back to a name search', async () => {
    const d = deps(null, [hit]);
    const r = await prepareTransportCreate(
      'u', 't', { type: 'flight', title: 'x', from: { name: 'BKK', googleMapsUrl: 'https://maps.app.goo.gl/x' } },
      { authorize: allow, budget: mkBudget(), linkDeps: d },
    );
    expect(r.body.fromLat).toBeNull();
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: 'url_unresolved', path: '/from' }));
    expect(d.readLink).toHaveBeenCalled();
    expect(d.search).not.toHaveBeenCalled();
  });
  it('invalid IATA code warns on /fromCode', async () => {
    const r = await prepareTransportCreate('u', 't', { ...legacy, fromCode: 'bkk', dayIdx: 0 }, { authorize: allow, budget: mkBudget(), linkDeps: deps() });
    expect(r.warnings).toEqual([expect.objectContaining({ code: 'iata_code_invalid', path: '/fromCode' })]);
  });
  it('no write access is 403 with zero lookups', async () => {
    const d = deps();
    const deny = vi.fn(async () => { throw new ServiceError('forbidden', 'no'); });
    await expect(
      prepareTransportCreate('u', 't', { ...legacy, to: { query: 'q' } }, { authorize: deny, budget: mkBudget(), linkDeps: d }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(d.search).not.toHaveBeenCalled();
    expect(d.readLink).not.toHaveBeenCalled();
  });
});

describe('patchTransport', () => {
  const update = vi.fn(async (_u: string, _i: string, patch: Record<string, unknown>) => ({ id: 'r', ...patch }) as never);
  const run = (body: Record<string, unknown>, d = deps()) =>
    patchTransport('u', 'r', body, { authorize: allow, update, budget: mkBudget(), linkDeps: d }).then((res) => ({
      ...res, patch: update.mock.calls.at(-1)![2], d,
    }));

  it('no endpoint input: zero lookups, no coord columns written', async () => {
    const r = await run({ seats: '12A' });
    expect(r.d.search).not.toHaveBeenCalled();
    expect(r.d.readLink).not.toHaveBeenCalled();
    expect(r.patch).toEqual({ seats: '12A' });
  });
  it('to hit re-resolves only to', async () => {
    const r = await run({ to: { query: 'Kansai' } });
    expect(r.patch).toMatchObject({ toLat: 34.43, toLng: 135.24, toPlaceId: null });
    expect(r.patch).not.toHaveProperty('fromLat');
  });
  it('unsupported url keeps coords', async () => {
    const r = await run({ from: { googleMapsUrl: 'https://example.com' } });
    expect(codes(r)).toContain('url_unsupported');
    expect(r.patch).not.toHaveProperty('fromLat');
  });
  it('unreadable short link keeps coords and never searches', async () => {
    const r = await run({ from: { name: 'BKK', googleMapsUrl: 'https://maps.app.goo.gl/x' } }, deps(null, [hit]));
    expect(codes(r)).toContain('url_unresolved');
    expect(r.patch).not.toHaveProperty('fromLat');
    expect(r.patch).not.toHaveProperty('fromPlaceId');
    expect(r.d.search).not.toHaveBeenCalled();
  });
  it('from null clears the three fields, leaves fromName', async () => {
    const r = await run({ from: null });
    expect(r.patch).toEqual({ fromLat: null, fromLng: null, fromPlaceId: null });
  });
  it('object wins over flat fromLat', async () => {
    const r = await run({ from: { query: 'KIX' }, fromLat: 1, fromLng: 2 });
    expect(r.patch).toMatchObject({ fromLat: 34.43, fromLng: 135.24 });
  });
  it('name-only end makes no lookup, keeps coords, updates fromName', async () => {
    const r = await run({ from: { name: 'X' } });
    expect(r.d.search).not.toHaveBeenCalled();
    expect(r.d.readLink).not.toHaveBeenCalled();
    expect(r.patch).toEqual({ fromName: 'X' });
  });
  it('name-only end does not override a sent fromName', async () => {
    const r = await run({ from: { name: 'X' }, fromName: 'Y' });
    expect(r.patch).toEqual({ fromName: 'Y' });
  });
  it('no write access is 403 with zero lookups', async () => {
    const d = deps();
    const deny = vi.fn(async () => { throw new ServiceError('forbidden', 'no'); });
    await expect(
      patchTransport('u', 'r', { to: { query: 'q' } }, { authorize: deny, update, budget: mkBudget(), linkDeps: d }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(d.search).not.toHaveBeenCalled();
    expect(d.readLink).not.toHaveBeenCalled();
  });
  it('bad body is 400 with zero lookups', async () => {
    const d = deps();
    await expect(run({ type: 'bus', to: { query: 'q' } }, d)).rejects.toMatchObject({ code: 'bad_request' });
    expect(d.search).not.toHaveBeenCalled();
  });
});
