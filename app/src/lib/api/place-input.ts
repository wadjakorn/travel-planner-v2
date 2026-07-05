// Map a JSON request body to the typed PlaceFields the place-service takes.
// Mirrors the FormData readPlaceFields in the action layer, but for JSON.

import { ServiceError } from '@/lib/services/service-error';
import type { PlaceFields, PlaceKind } from '@/lib/services/place-service';

const KINDS: PlaceKind[] = ['hotel', 'food', 'sight', 'transit'];

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
