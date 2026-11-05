import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolvePlacePatch } from './place-patch';
import { LinkBudget } from './place-link';
import type { PlaceFields } from '@/lib/services/place-service';
import type { GmapsLink } from '@/lib/places/gmaps-link';
import type { PlaceSuggestion } from '@/lib/places/types';

const stored: PlaceFields = {
  kind: 'food', status: 'confirmed', sourceUrl: null,
  name: 'Jay Fai', category: null, rating: null, reviews: null, time: '18:00',
  duration: null, price: null, address: '327 Maha Chai Rd', phone: null, website: null, hours: null,
  tags: ['crab'], thumb: null, note: 'book ahead', lat: 13.75, lng: 100.5, placeIdExternal: 'gcid:1',
};
const budget = () => new LinkBudget('u1', undefined, undefined, async () => ({ ok: true as const }));
const hit: PlaceSuggestion = {
  id: 'geoapify:1', name: 'Hit', secondary: null, address: 'Geo Addr', lat: 10, lng: 20, kind: 'food', timeZone: null,
};
const deps = (hits: PlaceSuggestion[] = [hit], l: GmapsLink | null = null) => ({
  readLink: vi.fn(async () => l),
  search: vi.fn(async () => hits),
  textSearch: null,
});
const LONG = 'https://www.google.com/maps/place/X/@1,2,17z';

describe('resolvePlacePatch (TP-0145)', () => {
  it('no location input: no lookup, the stored pin stays', async () => {
    const d = deps();
    const r = await resolvePlacePatch(stored, { note: 'x' }, null, budget(), d);
    expect(d.search).not.toHaveBeenCalled();
    expect(r.patch).toEqual({ note: 'x' });
    expect(r.merged).toMatchObject({ lat: 13.75, lng: 100.5, placeIdExternal: 'gcid:1', time: '18:00', note: 'x' });
    expect(r.warnings).toEqual([]);
  });

  it('same address resent: no lookup', async () => {
    const d = deps();
    await resolvePlacePatch(stored, { address: stored.address }, null, budget(), d);
    expect(d.search).not.toHaveBeenCalled();
  });

  it('changed address without lat/lng re-geocodes and drops the old placeIdExternal', async () => {
    const d = deps();
    const r = await resolvePlacePatch(stored, { address: 'New Rd' }, null, budget(), d);
    expect(d.search).toHaveBeenCalledOnce();
    expect(r.patch).toEqual({ address: 'New Rd', lat: 10, lng: 20, placeIdExternal: null });
    expect(r.warnings.map((w) => w.code)).toEqual(['coords_approx']);
  });

  it('changed address with lat/lng: coords are written as sent, no lookup', async () => {
    const d = deps();
    const r = await resolvePlacePatch(stored, { address: 'New Rd', lat: 1, lng: 2 }, null, budget(), d);
    expect(d.search).not.toHaveBeenCalled();
    expect(r.patch).toEqual({ address: 'New Rd', lat: 1, lng: 2 });
    expect(r.merged.placeIdExternal).toBe('gcid:1');
  });

  it('a failed re-geocode keeps the stored pin and reports place_unresolved', async () => {
    const r = await resolvePlacePatch(stored, { address: 'Nowhere' }, null, budget(), deps([]));
    expect(r.patch).toEqual({ address: 'Nowhere' });
    expect(r.merged).toMatchObject({ lat: 13.75, lng: 100.5, placeIdExternal: 'gcid:1' });
    expect(r.warnings.map((w) => w.code)).toEqual(['place_unresolved']);
  });

  it('clearing the address keeps the pin and warns nothing', async () => {
    const r = await resolvePlacePatch(stored, { address: null }, null, budget(), deps());
    expect(r.patch).toEqual({ address: null });
    expect(r.merged.lat).toBe(13.75);
    expect(r.warnings).toEqual([]);
  });

  it('lat/lng null clears the pin without a lookup', async () => {
    const d = deps();
    const r = await resolvePlacePatch(stored, { lat: null, lng: null }, null, budget(), d);
    expect(d.search).not.toHaveBeenCalled();
    expect(r.merged).toMatchObject({ lat: null, lng: null, placeIdExternal: 'gcid:1' });
  });

  it('a googleMapsUrl re-resolves even with no other change', async () => {
    const l: GmapsLink = { name: 'Jay Fai', query: null, lat: 13.7, lng: 100.4, precision: 'exact', cid: '9', googlePlaceId: null };
    const r = await resolvePlacePatch(stored, {}, LONG, budget(), deps([hit], l));
    expect(r.patch).toEqual({ lat: 13.7, lng: 100.4, placeIdExternal: 'gcid:9' });
  });
});
