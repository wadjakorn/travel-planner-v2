import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { LinkBudget, resolvePlanLinks } from './place-link';
import {
  resolveHotelLink, resolvePlanHotels, patchHotel, prepareHotelCreate, needsHotelResolve, type HotelLocation,
} from './hotel-link';
import type { ParsedImportPlan } from './import-input';
import type { HotelFields } from './hotel-input';
import type { PlaceFields } from '@/lib/services/place-service';
import type { HotelBooking } from '@/db/schema';
import type { HotelLinkInput } from './hotel-input';
import type { GmapsLink } from '@/lib/places/gmaps-link';
import type { PlaceSuggestion } from '@/lib/places/types';

const base: PlaceFields = {
  kind: 'food', status: 'confirmed', sourceUrl: null,
  name: 'Jay Fai', category: null, rating: null, reviews: null, time: null,
  duration: null, price: null, address: null, phone: null, website: null, hours: null,
  tags: [], thumb: null, note: null, lat: null, lng: null, placeIdExternal: null,
};
// Minimal ParsedImportPlan: hotels get parseHotelFields-like defaults.
const planWith = (o: {
  hotels?: Partial<HotelFields>[];
  days?: { date?: string | null; places: PlaceFields[] }[];
}): ParsedImportPlan => ({
  trip: { title: 'T', subtitle: null, startDate: null, endDate: null, cover: null },
  days: (o.days ?? []).map((d) => ({ date: d.date ?? null, places: d.places })),
  hotels: (o.hotels ?? []).map((h) => ({ status: 'confirmed', ...h }) as HotelFields),
});
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
  it('keeps the id from a sent googleMapsUrl when a tbd hotel then searches', async () => {
    const d = { ...gDeps(), readLink: vi.fn(async () => link({ lat: null, lng: null })) };
    const r = await resolveHotelLink(loc, { ...none, googleMapsUrl: LONG }, mkBudget(), d);
    expect(d.textSearch).toHaveBeenCalled();
    expect(r.resolved).toMatchObject({ lat: 33.85, lng: 132.78, placeIdExternal: 'gcid:123' });
  });
});

const current = {
  id: 'h', tripId: 't', dayIdx: null, name: 'Dogo', address: 'Dogo, Matsuyama', lat: 33.8, lng: 132.7,
  placeIdExternal: null, checkInDate: '2026-12-01', checkInTime: null, checkOutDate: '2026-12-02',
  checkOutTime: null, nights: 1, room: null, guests: null, ref: null, costAmount: null, costCurrency: null,
  cancellation: null, contact: null, notes: null, attachmentName: null, attachmentSize: null,
  attachmentUrl: null, thumb: null, arrivalMode: null, departureMode: null, status: 'tbd', area: 'Dogo',
  coordsApprox: true, createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null,
} as HotelBooking;
const loadHotel = vi.fn(async () => current);
const update = vi.fn(
  async (_u: string, _id: string, p: Record<string, unknown>, s: Record<string, unknown> = {}) =>
    ({ ...current, ...p, ...s }) as HotelBooking,
);

describe('needsHotelResolve', () => {
  it('only on new location input', () => {
    expect(needsHotelResolve({ notes: 'x' }, current, none)).toBe(false);
    expect(needsHotelResolve({ area: ' Dogo ' }, current, none)).toBe(false);
    expect(needsHotelResolve({ address: 'Dogo, Matsuyama' }, current, none)).toBe(false);
    expect(needsHotelResolve({ area: 'Okaido' }, current, none)).toBe(true);
    expect(needsHotelResolve({ address: 'New St' }, current, none)).toBe(true);
    expect(needsHotelResolve({}, current, { ...none, query: 'Hotel X' })).toBe(true);
    expect(needsHotelResolve({ area: 'Okaido', lat: 1, lng: 2 }, current, none)).toBe(false);
    expect(needsHotelResolve({ lat: 1, lng: 2 }, current, { ...none, googleMapsUrl: LONG })).toBe(true);
  });
});

describe('patchHotel', () => {
  beforeEach(() => {
    loadHotel.mockClear();
    update.mockClear();
  });
  it('PATCH re-resolve that is skipped keeps the stored coords', async () => {
    const budget = mkBudget(0); // every lookup skipped
    const r = await patchHotel('u', 'h', { area: 'Okaido' }, { loadHotel, update, budget, linkDeps: deps(null) });
    const [, , patch, server] = update.mock.calls[0];
    expect(patch).not.toHaveProperty('lat');
    expect(server).not.toHaveProperty('coordsApprox');
    expect(patch.name).toBe('Okaido'); // name follows area
    expect(r.warnings.map((w) => w.code)).toContain('lookup_skipped');
  });
  it('PATCH re-resolve that finds nothing keeps coords and warns place_unresolved', async () => {
    const d = deps(null, []);
    const r = await patchHotel('u', 'h', { area: 'Okaido' }, { loadHotel, update, budget: mkBudget(), linkDeps: d });
    expect(d.search).toHaveBeenCalledWith('Okaido', expect.anything());
    const [, , patch, server] = update.mock.calls[0];
    expect(patch).not.toHaveProperty('lat');
    expect(patch).not.toHaveProperty('lng');
    expect(patch).not.toHaveProperty('placeIdExternal');
    expect(server).toEqual({});
    expect(r.hotel).toMatchObject({ lat: 33.8, lng: 132.7, coordsApprox: true });
    expect(codes(r)).toContain('place_unresolved');
  });
  it('PATCH re-resolve that succeeds writes the new approx pin', async () => {
    const r = await patchHotel('u', 'h', { area: 'Okaido' }, { loadHotel, update, budget: mkBudget(), linkDeps: deps(null) });
    const [, , patch, server] = update.mock.calls[0];
    expect(patch).toMatchObject({ area: 'Okaido', name: 'Okaido', lat: 10, lng: 20, placeIdExternal: null });
    expect(patch).not.toHaveProperty('address'); // current.address is kept
    expect(server).toEqual({ coordsApprox: true });
    expect(codes(r)).not.toContain('hotel_without_location');
  });
  it('PATCH without new location input makes no lookup and keeps coords', async () => {
    const d = deps(null);
    await patchHotel('u', 'h', { notes: 'late check-in', address: current.address }, { loadHotel, update, budget: mkBudget(), linkDeps: d });
    expect(d.search).not.toHaveBeenCalled();
    expect(d.readLink).not.toHaveBeenCalled();
    const [, , patch, server] = update.mock.calls[0];
    expect(patch).not.toHaveProperty('lat');
    expect(patch).not.toHaveProperty('placeIdExternal');
    expect(server).toEqual({});
  });
  it('PATCH confirm with an exact googleMapsUrl -> exact pin, coordsApprox false', async () => {
    await patchHotel('u', 'h', { status: 'confirmed', name: 'Dogo Grand', googleMapsUrl: LONG }, { loadHotel, update, budget: mkBudget(), linkDeps: deps(link()) });
    const [, , patch, server] = update.mock.calls[0];
    expect(patch).toMatchObject({ status: 'confirmed', name: 'Dogo Grand', lat: 13.75, lng: 100.5, placeIdExternal: 'gcid:123' });
    expect(server).toEqual({ coordsApprox: false });
  });
  it('PATCH with lat/lng sets coordsApprox false without a lookup', async () => {
    const d = deps(null);
    await patchHotel('u', 'h', { lat: 1, lng: 2 }, { loadHotel, update, budget: mkBudget(), linkDeps: d });
    expect(d.search).not.toHaveBeenCalled();
    const [, , patch, server] = update.mock.calls[0];
    expect(patch).toMatchObject({ lat: 1, lng: 2 });
    expect(server).toEqual({ coordsApprox: false });
  });
  it('PATCH echoing coordsApprox:true with lat/lng keeps it approx', async () => {
    await patchHotel('u', 'h', { lat: 1, lng: 2, coordsApprox: true }, { loadHotel, update, budget: mkBudget(), linkDeps: deps(null) });
    expect(update.mock.calls[0][3]).toEqual({ coordsApprox: true });
  });
  it('PATCH bad status is a 400 before any lookup or write', async () => {
    const d = deps(null);
    await expect(
      patchHotel('u', 'h', { status: 'x', area: 'Okaido' }, { loadHotel, update, budget: mkBudget(), linkDeps: d }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(d.search).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('PATCH { address } on a confirmed hotel with an area searches name+address, not the stored area', async () => {
    const exact = { ...current, status: 'confirmed', name: 'Dogo Grand', area: 'Dogo', coordsApprox: false, placeIdExternal: 'gcid:9' } as HotelBooking;
    loadHotel.mockResolvedValueOnce(exact);
    const d = deps(null);
    await patchHotel('u', 'h', { address: '1-2 Real St' }, { loadHotel, update, budget: mkBudget(), linkDeps: d });
    expect(d.search).toHaveBeenCalledWith('Dogo Grand, 1-2 Real St', expect.anything());
    expect(d.search).not.toHaveBeenCalledWith('Dogo', expect.anything());
  });
  it('PATCH with an unresolvable googleMapsUrl keeps an exact pin (no search fallback write)', async () => {
    const exact = { ...current, status: 'confirmed', name: 'Dogo Grand', area: 'Dogo', coordsApprox: false, placeIdExternal: 'gcid:9' } as HotelBooking;
    loadHotel.mockResolvedValueOnce(exact);
    const r = await patchHotel('u', 'h', { googleMapsUrl: LONG }, { loadHotel, update, budget: mkBudget(), linkDeps: deps(null) });
    const [, , patch, server] = update.mock.calls[0];
    expect(patch).not.toHaveProperty('lat');
    expect(patch).not.toHaveProperty('lng');
    expect(patch).not.toHaveProperty('placeIdExternal');
    expect(server).toEqual({});
    expect(codes(r)).toContain('url_unresolved');
  });
  it('PATCH with an unsupported googleMapsUrl keeps the stored pin', async () => {
    const d = deps(null);
    await patchHotel('u', 'h', { googleMapsUrl: 'https://example.com/x' }, { loadHotel, update, budget: mkBudget(), linkDeps: d });
    const [, , patch, server] = update.mock.calls[0];
    expect(patch).not.toHaveProperty('lat');
    expect(server).toEqual({});
  });
  it('PATCH stores area trimmed and blank area as null', async () => {
    await patchHotel('u', 'h', { area: '  Okaido ' }, { loadHotel, update, budget: mkBudget(0), linkDeps: deps(null) });
    expect(update.mock.calls[0][2]).toMatchObject({ area: 'Okaido', name: 'Okaido' });
    await patchHotel('u', 'h', { area: '   ' }, { loadHotel, update, budget: mkBudget(0), linkDeps: deps(null) });
    expect(update.mock.calls[1][2]).toMatchObject({ area: null });
  });
  it('PATCH appends hotel warnings for the saved row', async () => {
    const r = await patchHotel('u', 'h', { checkOutDate: null }, { loadHotel, update, budget: mkBudget(), linkDeps: deps(null) });
    expect(codes(r)).toEqual(['hotel_without_dates']);
  });
});

describe('prepareHotelCreate', () => {
  it('address-only hotel is geocoded (intended change)', async () => {
    const d = deps(null);
    const r = await prepareHotelCreate('u', { name: 'Grand', address: '1 Main St' }, { budget: mkBudget(), linkDeps: d });
    expect(d.search).toHaveBeenCalledWith('Grand, 1 Main St', expect.anything());
    expect(r.body).toMatchObject({ name: 'Grand', address: '1 Main St', lat: 10, lng: 20 });
    expect(r.server).toEqual({ coordsApprox: true });
    expect(codes(r)).toEqual(['coords_approx']);
  });
  it('tbd area-only hotel takes the area as name and an approx pin', async () => {
    const r = await prepareHotelCreate('u', { status: 'tbd', area: 'Dogo Onsen' }, { budget: mkBudget(), linkDeps: deps(null) });
    expect(r.body).toMatchObject({ name: 'Dogo Onsen', lat: 10, lng: 20, placeIdExternal: null });
    expect(r.server).toEqual({ coordsApprox: true });
    expect(codes(r)).toEqual(['coords_approx', 'hotel_without_dates']);
  });
  it('create stores area trimmed', async () => {
    const r = await prepareHotelCreate('u', { status: 'tbd', area: ' Dogo ' }, { budget: mkBudget(0), linkDeps: deps(null) });
    expect(r.body).toMatchObject({ name: 'Dogo', area: 'Dogo' });
  });
  it('unresolved create carries hotel_without_location', async () => {
    const r = await prepareHotelCreate('u', { name: 'Grand' }, { budget: mkBudget(), linkDeps: deps(null) });
    expect(r.body).toMatchObject({ lat: null, lng: null });
    expect(r.server).toEqual({ coordsApprox: false });
    expect(codes(r)).toEqual(['hotel_without_location']);
  });
  it('prepareHotelCreate: bad status is a 400 before any lookup', async () => {
    const d = deps(null);
    await expect(
      prepareHotelCreate('u', { name: 'H', area: 'Dogo', status: 'x' }, { budget: mkBudget(), linkDeps: d }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(d.search).not.toHaveBeenCalled();
  });
  it('missing name on a confirmed hotel is a 400 before any lookup', async () => {
    const d = deps(null);
    await expect(
      prepareHotelCreate('u', { area: 'Dogo' }, { budget: mkBudget(), linkDeps: d }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(d.search).not.toHaveBeenCalled();
  });
});

describe('resolvePlanHotels', () => {
  it('resolves hotels before places on a shared budget', async () => {
    const budget = mkBudget(1); // exactly one lookup left
    const d = deps(null);
    const h = await resolvePlanHotels(
      planWith({ hotels: [{ name: 'Dogo', status: 'tbd', area: 'Dogo' }], days: [{ places: [{ ...base, address: 'X' }] }] }),
      [none], budget, d,
    );
    expect(h.plan.hotels[0]).toMatchObject({ lat: 10, coordsApprox: true });
    const p = await resolvePlanLinks('u', h.plan, [[null]], { ...d, budget });
    expect(p.warnings.map((w) => w.code)).toEqual(['lookup_skipped']);
  });
  it('hotel link warnings carry /hotels/i paths', async () => {
    const h = await resolvePlanHotels(
      planWith({ hotels: [{ name: 'A', lat: 1, lng: 2 }, { name: 'Dogo', status: 'tbd', area: 'Dogo' }] }),
      [none, none], mkBudget(), deps(null, []),
    );
    expect(h.warnings).toEqual([{ code: 'place_unresolved', path: '/hotels/1', message: expect.any(String) }]);
    expect(h.plan.hotels[1]).toMatchObject({ lat: null, lng: null, coordsApprox: false });
  });
  it('dryRun-echoed approx hotel stays approx on commit', async () => {
    const d = deps(null);
    const h = await resolvePlanHotels(
      planWith({ hotels: [{ name: 'Dogo', lat: 10, lng: 20 }] }), [{ ...none, approxEcho: true }], mkBudget(), d,
    );
    expect(h.plan.hotels[0].coordsApprox).toBe(true);
    expect(d.search).not.toHaveBeenCalled();
  });
  it('keeps other hotel fields and plan sections; runs at most 5 resolves at once', async () => {
    let live = 0;
    let peak = 0;
    const d = {
      readLink: vi.fn(async () => null),
      search: vi.fn(async () => {
        live++;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 5));
        live--;
        return [hit];
      }),
      textSearch: null,
    };
    const hotels = Array.from({ length: 8 }, (_, i) => ({ name: `H${i}`, status: 'tbd', area: `A${i}`, notes: 'n' }));
    const h = await resolvePlanHotels(planWith({ hotels }), hotels.map(() => none), mkBudget(), d);
    expect(d.search).toHaveBeenCalledTimes(8);
    expect(peak).toBeLessThanOrEqual(5);
    expect(h.plan.hotels.map((x) => x.name)).toEqual(hotels.map((x) => x.name));
    expect(h.plan.hotels[7]).toMatchObject({ notes: 'n', area: 'A7', status: 'tbd', lat: 10, coordsApprox: true });
  });
});
