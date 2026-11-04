import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { LinkBudget } from './place-link';
import { resolveHotelLink, type HotelLocation } from './hotel-link';
import type { HotelLinkInput } from './hotel-input';
import type { GmapsLink } from '@/lib/places/gmaps-link';
import type { PlaceSuggestion } from '@/lib/places/types';

const ok = async () => ({ ok: true as const });
const mkBudget = (lookups?: number, consume: ConstructorParameters<typeof LinkBudget>[3] = ok) =>
  new LinkBudget('u1', lookups, undefined, consume);

const LONG = 'https://www.google.com/maps/place/X/@1,2,17z';
const link = (o: Partial<GmapsLink> = {}): GmapsLink => ({
  name: 'Dogo', query: null, lat: 13.75, lng: 100.5, precision: 'exact', cid: '123', googlePlaceId: null, ...o,
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

const loc: HotelLocation = {
  name: 'Dogo', address: null, area: 'Dogo Onsen', lat: null, lng: null, placeIdExternal: null, status: 'tbd',
};
const none: HotelLinkInput = { googleMapsUrl: null, query: null, near: null, approxEcho: false };

describe('resolveHotelLink', () => {
  it('area alone is the search query -> approx coords', async () => {
    const d = deps(null);
    const r = await resolveHotelLink(loc, none, mkBudget(), d);
    expect(d.search).toHaveBeenCalledWith('Dogo Onsen', expect.anything());
    expect(r.resolved).toMatchObject({ lat: 10, lng: 20, coordsApprox: true });
  });
  it('query outranks area', async () => {
    const d = deps(null);
    await resolveHotelLink(loc, { ...none, query: 'Hotel X' }, mkBudget(), d);
    expect(d.search).toHaveBeenCalledWith('Hotel X', expect.anything());
  });
  it('exact googleMapsUrl -> exact coords, coordsApprox false, gcid id', async () => {
    const r = await resolveHotelLink(loc, { ...none, googleMapsUrl: LONG }, mkBudget(), deps(link()));
    expect(r.resolved).toMatchObject({ lat: 13.75, lng: 100.5, coordsApprox: false, placeIdExternal: 'gcid:123' });
  });
  it('viewport link -> coordsApprox true', async () => {
    const r = await resolveHotelLink(
      loc, { ...none, googleMapsUrl: LONG }, mkBudget(), deps(link({ precision: 'viewport' })),
    );
    expect(r.resolved).toMatchObject({ lat: 13.75, lng: 100.5, coordsApprox: true });
    expect(codes(r)).toEqual(['coords_approx']);
  });
  it('agent lat/lng -> no lookup, coordsApprox false', async () => {
    const d = deps(null);
    const r = await resolveHotelLink({ ...loc, lat: 1, lng: 2 }, none, mkBudget(), d);
    expect(d.search).not.toHaveBeenCalled();
    expect(r.resolved).toMatchObject({ lat: 1, lng: 2, coordsApprox: false });
  });
  it('honours an echoed coordsApprox:true with agent coords', async () => {
    const r = await resolveHotelLink(
      { ...loc, lat: 1, lng: 2 }, { ...none, approxEcho: true }, mkBudget(), deps(null),
    );
    expect(r.resolved.coordsApprox).toBe(true);
  });
  it('name-only hotel makes no lookup and returns no coords', async () => {
    const d = deps(null);
    const r = await resolveHotelLink({ ...loc, area: null }, none, mkBudget(), d);
    expect(d.search).not.toHaveBeenCalled();
    expect(r.resolved).toMatchObject({ lat: null, lng: null, coordsApprox: false });
  });
  // Google Text Search hit carries a place id (exact coords, no coords_approx warning).
  const gDeps = () => ({
    readLink: vi.fn(async () => null),
    search: vi.fn(async () => []),
    textSearch: vi.fn(async () => [{ placeId: 'ChIJdogo', name: 'Dogo', lat: 33.85, lng: 132.78, address: 'Matsuyama' }]),
  });
  it('tbd search hit does not adopt a provider place id, but is still approx', async () => {
    const r = await resolveHotelLink(loc, none, mkBudget(), gDeps());
    expect(r.resolved).toMatchObject({ lat: 33.85, lng: 132.78, placeIdExternal: null, coordsApprox: true });
  });
  it('confirmed search hit adopts the provider place id', async () => {
    const r = await resolveHotelLink({ ...loc, status: 'confirmed' }, none, mkBudget(), gDeps());
    expect(r.resolved.placeIdExternal).toBe('ChIJdogo');
  });
});
