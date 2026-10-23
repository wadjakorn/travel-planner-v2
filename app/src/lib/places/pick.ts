import { deriveCode } from '@/lib/transport-compute';
import { utcOffsetMinutes } from './utc-offset';
import type { Located, PlaceDetail, PlaceSuggestion } from './types';

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
  return out;
}
