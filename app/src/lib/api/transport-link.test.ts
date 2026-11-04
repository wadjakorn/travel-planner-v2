import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { LinkBudget } from './place-link';
import { resolveTransportEnd, prepareTransportCreate } from './transport-link';
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
