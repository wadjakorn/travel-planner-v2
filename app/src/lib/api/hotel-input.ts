// Map a JSON request body to the writable hotel columns the booking-service
// insert takes. Mirrors the whitelist in booking-service.createHotel, but as a
// standalone parser the plan importer (API-IMPORT) can reuse inside a
// transaction — and it validates value types up front (like parsePlaceFields)
// so a bad field is a 400, not a DB 500. Server-managed columns
// (id/tripId/timestamps/deletedAt) are never accepted from the client.

import { ServiceError } from '@/lib/services/service-error';
import { isRealISODate } from '@/lib/api/iso-date';

// Text columns: kept as-is when a non-null string, else rejected.
const STRING_FIELDS = [
  'name', 'address', 'placeIdExternal', 'checkInTime',
  'checkOutTime', 'room', 'ref', 'costCurrency',
  'cancellation', 'contact', 'notes', 'thumb', 'attachmentName',
  'attachmentSize',
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

  if (typeof out.name !== 'string' || !out.name.trim()) {
    throw new ServiceError('bad_request', '"name" is required');
  }
  return out as HotelFields;
}
