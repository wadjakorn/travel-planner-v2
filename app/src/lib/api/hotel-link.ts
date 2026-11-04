import 'server-only';
import {
  hotelNameFor,
  parseHotelStatus,
  readHotelLink,
  renamedForArea,
  type HotelLinkInput,
  type HotelStatus,
} from '@/lib/api/hotel-input';
import { hotelWarnings, type ImportWarning } from '@/lib/api/import-warnings';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import {
  applyPlaceLink,
  LinkBudget,
  type PlaceLinkDeps,
  type PlaceLinkSource,
  type PlaceLinkWarning,
} from '@/lib/api/place-link';
import type { PlaceFields } from '@/lib/services/place-service';
import {
  getHotelForWrite,
  updateHotel,
  type HotelServerFields,
} from '@/lib/services/booking-service';
import { ServiceError } from '@/lib/services/service-error';
import type { HotelBooking } from '@/db/schema';

export type HotelLocation = {
  name: string;
  address: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  placeIdExternal: string | null;
  status: HotelStatus;
};

export type HotelResolved = {
  lat: number | null;
  lng: number | null;
  address: string | null;
  placeIdExternal: string | null;
  coordsApprox: boolean;
};

// Thin adapter over applyPlaceLink (never searches itself): input order is
// googleMapsUrl -> lat/lng -> query(+near) -> area -> [name, address].
export async function resolveHotelLink(
  loc: HotelLocation,
  input: HotelLinkInput,
  budget: LinkBudget,
  deps: PlaceLinkDeps = {},
): Promise<{ resolved: HotelResolved; warnings: PlaceLinkWarning[]; source: PlaceLinkSource }> {
  const fields: PlaceFields = {
    kind: 'hotel', status: 'confirmed', sourceUrl: null,
    name: loc.name, category: null, rating: null, reviews: null, time: null,
    duration: null, price: null, address: loc.address, phone: null, website: null, hours: null,
    tags: [], thumb: null, note: null, lat: loc.lat, lng: loc.lng, placeIdExternal: loc.placeIdExternal,
  };
  const { fields: out, warnings, source } = await applyPlaceLink(
    fields,
    input.googleMapsUrl,
    budget,
    deps,
    { query: input.query ?? loc.area, near: input.near },
  );
  const coordsApprox =
    source === 'search' ||
    warnings.some((w) => w.code === 'coords_approx') ||
    (source === 'input' && input.approxEcho);
  // An unbooked hotel keeps its own id: a search hit's id is the area's, not the
  // hotel's. An id read from the user's own googleMapsUrl is kept, though.
  const placeIdExternal =
    source === 'search' && loc.status === 'tbd' && input.googleMapsUrl === null
      ? loc.placeIdExternal
      : out.placeIdExternal;
  return {
    resolved: { lat: out.lat, lng: out.lng, address: out.address, placeIdExternal, coordsApprox },
    warnings,
    source,
  };
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
// area is stored trimmed like name (blank -> null); non-strings pass through.
const trimArea = (v: unknown): unknown => (typeof v === 'string' ? v.trim() || null : v);

// A sent googleMapsUrl that could not be read (unsupported, unresolved, or
// skipped before the read). A search after it is a name/address fallback, not
// the link's own place.
const LINK_FAILED = new Set(['url_unsupported', 'url_unresolved', 'lookup_skipped']);

// PATCH: re-resolve only on new location input. A link always resolves; sent
// lat/lng win over query/area/address; an unchanged area/address is no input.
export function needsHotelResolve(
  body: Record<string, unknown>,
  current: HotelBooking,
  input: HotelLinkInput,
): boolean {
  if (input.googleMapsUrl !== null) return true;
  if ('lat' in body || 'lng' in body) return false;
  if (input.query !== null) return true;
  const area = text(body.area);
  if (area && area !== current.area) return true;
  const address = text(body.address);
  return !!address && address !== current.address;
}

export type HotelResolveDeps = { budget?: LinkBudget; linkDeps?: PlaceLinkDeps };

// POST: validate (no lookup on a 400), then resolve outside the idempotent tx.
export async function prepareHotelCreate(
  userId: string,
  body: Record<string, unknown>,
  deps: HotelResolveDeps = {},
): Promise<{ body: Record<string, unknown>; server: HotelServerFields; warnings: ImportWarning[] }> {
  const status = parseHotelStatus(body.status) ?? 'confirmed';
  const name = hotelNameFor({ name: body.name, area: body.area, status });
  const input = readHotelLink(body);
  const { resolved, warnings } = await resolveHotelLink(
    {
      name,
      address: strOrNull(body.address),
      area: text(body.area) || null,
      lat: numOrNull(body.lat),
      lng: numOrNull(body.lng),
      placeIdExternal: strOrNull(body.placeIdExternal),
      status,
    },
    input,
    deps.budget ?? new LinkBudget(userId),
    deps.linkDeps,
  );
  const prepared: Record<string, unknown> = {
    ...body,
    ...('area' in body ? { area: trimArea(body.area) } : {}),
    name,
    lat: resolved.lat,
    lng: resolved.lng,
    address: resolved.address,
    placeIdExternal: resolved.placeIdExternal,
  };
  return {
    body: prepared,
    server: { coordsApprox: resolved.coordsApprox },
    warnings: [...warnings, ...hotelWarnings(prepared)],
  };
}

export type HotelPatchDeps = HotelResolveDeps & {
  loadHotel?: typeof getHotelForWrite;
  update?: typeof updateHotel;
};

// PATCH: a failed re-resolve writes no location columns, so the stored pin survives.
export async function patchHotel(
  userId: string,
  hotelId: string,
  body: Record<string, unknown>,
  deps: HotelPatchDeps = {},
): Promise<{ hotel: HotelBooking; warnings: ImportWarning[] }> {
  const current = await (deps.loadHotel ?? getHotelForWrite)(userId, hotelId);
  const input = readHotelLink(body);
  const status = parseHotelStatus(body.status) ?? current.status;
  if ('name' in body && !text(body.name)) {
    throw new ServiceError('bad_request', '"name" must not be empty');
  }
  const patch: Record<string, unknown> = { ...body };
  if ('area' in body) patch.area = trimArea(body.area);
  const renamed = renamedForArea(current, body);
  if (renamed) patch.name = renamed;

  const server: HotelServerFields = {};
  const sentCoords = 'lat' in body || 'lng' in body;
  if (sentCoords && input.googleMapsUrl === null) {
    server.coordsApprox = input.approxEcho && body.lat != null && body.lng != null;
  }

  const warnings: ImportWarning[] = [];
  if (needsHotelResolve(body, current, input)) {
    const r = await resolveHotelLink(
      {
        name: text(patch.name) || current.name,
        address: 'address' in body ? strOrNull(body.address) : current.address,
        // Only a CHANGED area is search input (same rule as needsHotelResolve):
        // a stale/resent area must not override a new address (it would drop an
        // exact pin to a centroid).
        area: text(body.area) && text(body.area) !== current.area ? text(body.area) : null,
        lat: 'lat' in body ? numOrNull(body.lat) : null,
        lng: 'lng' in body ? numOrNull(body.lng) : null,
        placeIdExternal: 'placeIdExternal' in body ? strOrNull(body.placeIdExternal) : null,
        status,
      },
      input,
      deps.budget ?? new LinkBudget(userId),
      deps.linkDeps,
    );
    warnings.push(...r.warnings);
    // A failed link must not fall back to a name/address search that replaces
    // the stored pin: only the link itself or the caller's lat/lng may write.
    const linkFailed =
      input.googleMapsUrl !== null && r.warnings.some((w) => LINK_FAILED.has(w.code));
    const accepted = !(linkFailed && r.source === 'search');
    if (accepted && r.resolved.lat != null) {
      patch.lat = r.resolved.lat;
      patch.lng = r.resolved.lng;
      patch.placeIdExternal = r.resolved.placeIdExternal;
      server.coordsApprox = r.resolved.coordsApprox;
      if (!('address' in body) && current.address === null) patch.address = r.resolved.address;
    }
  }

  const hotel = await (deps.update ?? updateHotel)(userId, hotelId, patch, server);
  return { hotel, warnings: [...warnings, ...hotelWarnings(hotel)] };
}

// Same value as place-link's private PLAN_CONCURRENCY (kept unexported there).
const HOTEL_CONCURRENCY = 5;

// Import: resolve every hotel's location on the per-import budget. The caller
// runs this BEFORE resolvePlanLinks on the same budget, so hotels get pins
// first and places are the ones that see lookup_skipped when it runs out.
export async function resolvePlanHotels(
  plan: ParsedImportPlan,
  inputs: HotelLinkInput[],
  budget: LinkBudget,
  deps: PlaceLinkDeps = {},
): Promise<{ plan: ParsedImportPlan; warnings: ImportWarning[] }> {
  const hotels = [...plan.hotels];
  const results: PlaceLinkWarning[][] = [];
  let next = 0;
  const worker = async () => {
    while (next < plan.hotels.length) {
      const i = next++;
      const h = plan.hotels[i];
      const status: HotelStatus = h.status === 'tbd' ? 'tbd' : 'confirmed';
      const { resolved, warnings } = await resolveHotelLink(
        {
          name: h.name,
          address: strOrNull(h.address),
          area: text(h.area) || null,
          lat: numOrNull(h.lat),
          lng: numOrNull(h.lng),
          placeIdExternal: strOrNull(h.placeIdExternal),
          status,
        },
        inputs[i] ?? { googleMapsUrl: null, query: null, near: null, approxEcho: false },
        budget,
        deps,
      );
      hotels[i] = { ...h, ...resolved };
      results[i] = warnings;
    }
  };
  await Promise.all(Array.from({ length: Math.min(HOTEL_CONCURRENCY, plan.hotels.length) }, worker));
  const warnings: ImportWarning[] = results.flatMap((ws, i) =>
    (ws ?? []).map((w) => ({ code: w.code, path: '/hotels/' + i, message: w.message })),
  );
  return { plan: { ...plan, hotels }, warnings };
}
