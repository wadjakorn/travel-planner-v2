import { deriveCode } from '@/lib/transport-compute';
import { utcOffsetMinutes } from './utc-offset';
import { isGooglePlaceId } from './place-id';
import type { GooglePick } from './google-sync';
import type { Fields, Located, PlaceDetail, PlaceSuggestion } from './types';

export type HotelSelection = {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
};

export type PlaceSelection = {
  name: string;
  code: string | null;
  secondary: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  utcOffsetMinutes: number | null;
};

export type EnsureCoords = (s: PlaceSuggestion) => Promise<Located | null>;

export async function hotelSelectionFrom(s: PlaceSuggestion, ensure: EnsureCoords): Promise<HotelSelection | null> {
  const c = await ensure(s);
  if (!c) return null;
  return { name: c.name, address: c.address ?? c.secondary, lat: c.lat, lng: c.lng, placeId: c.id };
}

export async function transportSelectionFrom(s: PlaceSuggestion, ensure: EnsureCoords): Promise<PlaceSelection | null> {
  const c = await ensure(s);
  if (!c) return null;
  return {
    name: c.name,
    code: deriveCode(c.name),
    secondary: c.secondary,
    lat: c.lat,
    lng: c.lng,
    placeId: c.id,
    utcOffsetMinutes: c.timeZone ? utcOffsetMinutes(c.timeZone) : null,
  };
}

export function hotelFormFrom(s: Located): Record<string, string> {
  return {
    name: s.name,
    address: s.address ?? '',
    lat: String(s.lat),
    lng: String(s.lng),
    placeIdExternal: s.id,
  };
}

export function placeFormFrom(p: PlaceDetail): Record<string, string> {
  const out: Record<string, string> = {
    kind: p.kind,
    ...hotelFormFrom(p),
    phone: p.phone ?? '',
    website: p.website ?? '',
    hours: p.hours ?? '',
  };
  if (p.rating != null) out.rating = String(p.rating);
  if (p.reviews != null) out.reviews = String(p.reviews);
  const pick = googlePickJson(p, 'full');
  if (pick) out.googlePick = pick;
  return out;
}

/** The add-place form for `addPlaceInlineAction`. */
export function placeFormData(dayId: string, p: PlaceDetail): FormData {
  const fd = new FormData();
  fd.set('dayId', dayId);
  for (const [k, v] of Object.entries(placeFormFrom(p))) fd.set(k, v);
  return fd;
}

// The hidden `googlePick` form value: the permanent Google fields the pick
// returned (never rating/reviews/hours). A `basic` pick has no phone/website.
export function googlePickJson(p: PlaceDetail, fields: Fields): string | null {
  if (!isGooglePlaceId(p.id)) return null;
  const snapshot: GooglePick['snapshot'] = { name: p.name, address: p.address, lat: p.lat, lng: p.lng };
  if (fields === 'full') {
    snapshot.phone = p.phone;
    snapshot.website = p.website;
  }
  const pick: GooglePick = { fields, snapshot };
  return JSON.stringify(pick);
}
