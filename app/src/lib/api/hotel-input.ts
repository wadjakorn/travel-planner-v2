// Map a JSON request body to the writable hotel columns the booking-service
// insert takes. Mirrors the whitelist in booking-service.createHotel, but as a
// standalone parser the plan importer (API-IMPORT) can reuse inside a
// transaction. Server-managed columns (id/tripId/timestamps/deletedAt) are
// never accepted from the client.

import { ServiceError } from '@/lib/services/service-error';

const HOTEL_FIELDS = [
  'dayIdx', 'name', 'address', 'lat', 'lng', 'placeIdExternal',
  'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime', 'nights',
  'room', 'guests', 'ref', 'costAmount', 'costCurrency', 'cancellation',
  'contact', 'notes', 'thumb', 'arrivalMode', 'departureMode',
  'attachmentName', 'attachmentSize',
] as const;

export type HotelFields = Record<string, unknown> & { name: string };

export function parseHotelFields(body: Record<string, unknown>): HotelFields {
  const out: Record<string, unknown> = {};
  for (const k of HOTEL_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  if (typeof out.name !== 'string' || !out.name.trim()) {
    throw new ServiceError('bad_request', '"name" is required');
  }
  return out as HotelFields;
}
