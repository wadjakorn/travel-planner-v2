// Map a JSON request body to the typed PlaceFields the place-service takes.
// Mirrors the FormData readPlaceFields in the action layer, but for JSON.

import { ServiceError } from '@/lib/services/service-error';
import type { PlaceFields, PlaceKind, PlaceStatus } from '@/lib/services/place-service';

const KINDS: PlaceKind[] = ['hotel', 'food', 'sight', 'transit'];
const PLACE_STATUSES: PlaceStatus[] = ['confirmed', 'tbd'];

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    throw new ServiceError('bad_request', 'Expected a string field');
  }
  const t = v.trim();
  return t === '' ? null : t;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ServiceError('bad_request', 'Expected a numeric field');
  }
  return v;
}

// Scheme-validate a source/origin URL: accept only http/https, reject
// javascript:/data:/mailto: and malformed strings with a 400. Returns null when
// absent. Shared by place + trip sourceUrl input (TP-0043).
export function parseHttpUrl(v: unknown, label = '"sourceUrl"'): string | null {
  const s = str(v);
  if (s === null) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new ServiceError('bad_request', `${label} must be a valid http(s) URL`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ServiceError('bad_request', `${label} must use the http or https scheme`);
  }
  return s;
}

function status(v: unknown): PlaceStatus {
  const s = str(v);
  if (s === null) return 'confirmed';
  if (!PLACE_STATUSES.includes(s as PlaceStatus)) {
    throw new ServiceError('bad_request', '"status" must be one of: confirmed, tbd');
  }
  return s as PlaceStatus;
}

function tags(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  if (
    !Array.isArray(v) ||
    v.some((t) => typeof t !== 'string')
  ) {
    throw new ServiceError('bad_request', '"tags" must be an array of strings');
  }
  return (v as string[]).map((t) => t.trim()).filter((t) => t.length > 0);
}

export function parsePlaceFields(body: Record<string, unknown>): PlaceFields {
  const kind = body.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind as PlaceKind)) {
    throw new ServiceError(
      'bad_request',
      '"kind" must be one of: hotel, food, sight, transit',
    );
  }
  const name = str(body.name);
  if (!name) throw new ServiceError('bad_request', '"name" is required');

  const reviews = num(body.reviews);
  return {
    kind: kind as PlaceKind,
    status: status(body.status),
    sourceUrl: parseHttpUrl(body.sourceUrl),
    name,
    category: str(body.category),
    rating: num(body.rating),
    reviews: reviews === null ? null : Math.round(reviews),
    time: str(body.time),
    duration: str(body.duration),
    price: str(body.price),
    address: str(body.address),
    phone: str(body.phone),
    website: str(body.website),
    hours: str(body.hours),
    tags: tags(body.tags),
    thumb: str(body.thumb),
    note: str(body.note),
    lat: num(body.lat),
    lng: num(body.lng),
    placeIdExternal: str(body.placeIdExternal),
  };
}

export function readPlaceLink(body: Record<string, unknown>): string | null {
  const v = body.googleMapsUrl;
  if (v === undefined || v === null) return null;
  const t = typeof v === 'string' ? v.trim() : null;
  if (t === null || t.length > 2048) {
    throw new ServiceError('bad_request', '"googleMapsUrl" must be a string of at most 2048 characters');
  }
  return t === '' ? null : t;
}

// --- Wave-1 place parse slots (P0-CONTRACT) --------------------------------
//
// query/near are resolve-time inputs (TP-0037) kept parallel to PlaceFields.
// status/sourceUrl are now folded into PlaceFields (parsePlaceFields persists
// them, TP-0042/TP-0043); they stay mirrored here so this slot's shape is a
// superset callers can read uniformly.
export type { PlaceStatus } from '@/lib/services/place-service';

export type PlaceNear = { lat: number; lng: number };

export type PlaceInputExtras = {
  // Free-text search query to resolve a place server-side (TP-0037).
  query: string | null;
  // Bias point for that search: {lat,lng} object or a "lat,lng" string.
  near: PlaceNear | null;
  // Planning status — maps to place.status (default 'confirmed') on persist.
  status: PlaceStatus | null;
  // Origin link — maps to place.source_url on persist.
  sourceUrl: string | null;
};

function parseNear(v: unknown): PlaceNear | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const parts = v.split(',').map((s) => s.trim());
    // Number('') === 0, so an empty component ("48.8,") must be rejected
    // explicitly or it would silently parse to lng:0.
    const lat = parts[0] === '' ? NaN : Number(parts[0]);
    const lng = parts[1] === '' ? NaN : Number(parts[1]);
    if (parts.length !== 2 || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ServiceError('bad_request', '"near" string must be "lat,lng"');
    }
    return { lat, lng };
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const lat = num(o.lat);
    const lng = num(o.lng);
    if (lat === null || lng === null) {
      throw new ServiceError('bad_request', '"near" must have numeric lat and lng');
    }
    return { lat, lng };
  }
  throw new ServiceError('bad_request', '"near" must be a {lat,lng} object or "lat,lng" string');
}

function parseStatus(v: unknown): PlaceStatus | null {
  const s = str(v);
  if (s === null) return null;
  if (!PLACE_STATUSES.includes(s as PlaceStatus)) {
    throw new ServiceError('bad_request', '"status" must be one of: confirmed, tbd');
  }
  return s as PlaceStatus;
}

export function readPlaceExtras(body: Record<string, unknown>): PlaceInputExtras {
  return {
    query: str(body.query),
    near: parseNear(body.near),
    status: parseStatus(body.status),
    sourceUrl: str(body.sourceUrl),
  };
}
