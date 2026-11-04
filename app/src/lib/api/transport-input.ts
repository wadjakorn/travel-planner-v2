// Pure parsing of the optional `from` / `to` ride endpoint objects (TP-0142).
// Resolve-time inputs only: nothing here is stored as-is. No DB, no network.

import { ServiceError } from '@/lib/services/service-error';
import { readPlaceLink, readPlaceExtras, type PlaceNear } from '@/lib/api/place-input';
import { withContext } from '@/lib/api/with-context';

export type TransportEndInput = {
  // Label; copied to fromName/toName when that is absent.
  name: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  googleMapsUrl: string | null;
  query: string | null;
  near: PlaceNear | null;
};

// undefined = end not sent; null = clear it; object = resolve input.
export type TransportEnds = {
  from: TransportEndInput | null | undefined;
  to: TransportEndInput | null | undefined;
  // Body with the flat <end>Lat/Lng/PlaceId keys removed for every end that was
  // sent as an object or null (the object wins). Input is not mutated.
  body: Record<string, unknown>;
};

const bad = (m: string) => new ServiceError('bad_request', m);

function coord(v: unknown, key: 'lat' | 'lng', max: number): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > max) {
    throw bad(`"${key}" must be a number from -${max} to ${max}`);
  }
  return v;
}

function readEnd(o: Record<string, unknown>): TransportEndInput {
  let name: string | null = null;
  if (o.name !== undefined && o.name !== null) {
    if (typeof o.name !== 'string' || o.name.length > 200) {
      throw bad('"name" must be a string of at most 200 characters');
    }
    name = o.name.trim() || null;
  }
  const lat = coord(o.lat, 'lat', 90);
  const lng = coord(o.lng, 'lng', 180);
  if ((lat === null) !== (lng === null)) throw bad('"lat" and "lng" go together');
  let placeId: string | null = null;
  if (o.placeId !== undefined && o.placeId !== null) {
    if (typeof o.placeId !== 'string' || o.placeId.length > 512) {
      throw bad('"placeId" must be a string of at most 512 characters');
    }
    placeId = o.placeId.trim() || null;
  }
  const googleMapsUrl = readPlaceLink(o);
  // Only query/near: status/sourceUrl in an end object are ignored, never validated.
  const { query, near } = readPlaceExtras({ query: o.query, near: o.near });
  return { name, lat, lng, placeId, googleMapsUrl, query, near };
}

export function readTransportEnds(body: Record<string, unknown>): TransportEnds {
  const cleaned: Record<string, unknown> = { ...body };
  const out: { from: TransportEnds['from']; to: TransportEnds['to'] } = {
    from: undefined,
    to: undefined,
  };
  for (const key of ['from', 'to'] as const) {
    const v = body[key];
    if (v === undefined) continue;
    delete cleaned[`${key}Lat`];
    delete cleaned[`${key}Lng`];
    delete cleaned[`${key}PlaceId`];
    if (v === null) {
      out[key] = null;
      continue;
    }
    if (typeof v !== 'object' || Array.isArray(v)) {
      throw bad(`"${key}" must be an object or null`);
    }
    const end = withContext(key, () => readEnd(v as Record<string, unknown>));
    if (end.lat === null && !end.googleMapsUrl && !end.query && !end.name) {
      throw bad(`"${key}" needs lat/lng, googleMapsUrl, query or name`);
    }
    out[key] = end;
  }
  return { ...out, body: cleaned };
}
