// Map a JSON request body to the writable hotel columns the booking-service
// insert takes. Mirrors the whitelist in booking-service.createHotel, but as a
// standalone parser the plan importer (API-IMPORT) can reuse inside a
// transaction — and it validates value types up front (like parsePlaceFields)
// so a bad field is a 400, not a DB 500. Server-managed columns
// (id/tripId/timestamps/deletedAt) are never accepted from the client.

import { ServiceError } from '@/lib/services/service-error';
import { isRealISODate } from '@/lib/api/iso-date';
import { readPlaceLink, readPlaceExtras, type PlaceNear } from '@/lib/api/place-input';

// Text columns: kept as-is when a non-null string, else rejected.
const STRING_FIELDS = [
  'name', 'address', 'placeIdExternal', 'checkInTime',
  'checkOutTime', 'room', 'ref', 'costCurrency',
  'cancellation', 'contact', 'notes', 'thumb', 'attachmentName',
  'attachmentSize', 'area',
] as const;
// Text columns that must still be a real YYYY-MM-DD calendar date, matching the
// contract import trip/day dates enforce (a bad date is a 400, not stored junk).
const DATE_FIELDS = ['checkInDate', 'checkOutDate'] as const;
// Real-number columns.
const NUMBER_FIELDS = ['lat', 'lng', 'costAmount'] as const;
// Integer columns.
const INT_FIELDS = ['dayIdx', 'nights', 'guests'] as const;
// segment_mode enum columns.
const MODE_FIELDS = ['arrivalMode', 'departureMode'] as const;
const MODES = ['drive', 'walk', 'transit'];

export type HotelFields = Record<string, unknown> & { name: string };

export function parseHotelFields(body: Record<string, unknown>): HotelFields {
  const out: Record<string, unknown> = {};

  for (const k of STRING_FIELDS) {
    const v = body[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') {
      throw new ServiceError('bad_request', `"${k}" must be a string`);
    }
    out[k] = v;
  }
  for (const k of DATE_FIELDS) {
    const v = body[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || !isRealISODate(v)) {
      throw new ServiceError('bad_request', `"${k}" must be a valid YYYY-MM-DD date`);
    }
    out[k] = v;
  }
  for (const k of NUMBER_FIELDS) {
    const v = body[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new ServiceError('bad_request', `"${k}" must be a number`);
    }
    out[k] = v;
  }
  for (const k of INT_FIELDS) {
    const v = body[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      throw new ServiceError('bad_request', `"${k}" must be an integer`);
    }
    out[k] = v;
  }
  for (const k of MODE_FIELDS) {
    const v = body[k];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || !MODES.includes(v)) {
      throw new ServiceError('bad_request', `"${k}" must be one of: ${MODES.join(', ')}`);
    }
    out[k] = v;
  }

  out.status = parseHotelStatus(body.status) ?? 'confirmed';
  out.name = hotelNameFor({ name: out.name, area: out.area, status: out.status });
  return out as HotelFields;
}

export type HotelStatus = 'confirmed' | 'tbd';
const HOTEL_STATUSES: readonly string[] = ['confirmed', 'tbd'];

export function parseHotelStatus(v: unknown): HotelStatus | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !HOTEL_STATUSES.includes(v)) {
    throw new ServiceError('bad_request', '"status" must be one of: confirmed, tbd');
  }
  return v as HotelStatus;
}

function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// name is NOT NULL: a tbd hotel may omit it and take its area instead.
export function hotelNameFor(f: { name?: unknown; area?: unknown; status?: unknown }): string {
  const name = trimmed(f.name);
  if (name) return name;
  if (f.status === 'tbd') {
    const area = trimmed(f.area);
    if (area) return area;
    throw new ServiceError('bad_request', '"name" or "area" is required for a tbd hotel');
  }
  throw new ServiceError('bad_request', '"name" is required');
}

// PATCH: name follows a new area only while name === area. Never returns empty,
// so clearing the area leaves name untouched (name can't be null).
export function renamedForArea(
  current: { name: string; area: string | null },
  patch: Record<string, unknown>,
): string | undefined {
  if (!('area' in patch) || 'name' in patch) return undefined;
  if (current.area === null || current.name !== current.area) return undefined;
  const next = trimmed(patch.area);
  return next || undefined;
}

export type HotelLinkInput = {
  googleMapsUrl: string | null;
  query: string | null;
  near: PlaceNear | null;
  approxEcho: boolean;
};

export function readHotelLink(body: Record<string, unknown>): HotelLinkInput {
  const googleMapsUrl = readPlaceLink(body);
  const { query, near } = readPlaceExtras(body);
  const c = body.coordsApprox;
  if (c !== undefined && c !== null && typeof c !== 'boolean') {
    throw new ServiceError('bad_request', '"coordsApprox" must be a boolean');
  }
  return { googleMapsUrl, query, near, approxEcho: c === true };
}
