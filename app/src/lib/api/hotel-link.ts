import 'server-only';
import type { HotelLinkInput, HotelStatus } from '@/lib/api/hotel-input';
import {
  applyPlaceLink,
  type LinkBudget,
  type PlaceLinkDeps,
  type PlaceLinkWarning,
} from '@/lib/api/place-link';
import type { PlaceFields } from '@/lib/services/place-service';

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
): Promise<{ resolved: HotelResolved; warnings: PlaceLinkWarning[] }> {
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
  // An unbooked hotel keeps its own id: a search hit's id is the area's, not the hotel's.
  const placeIdExternal =
    source === 'search' && loc.status === 'tbd' ? loc.placeIdExternal : out.placeIdExternal;
  return {
    resolved: { lat: out.lat, lng: out.lng, address: out.address, placeIdExternal, coordsApprox },
    warnings,
  };
}
