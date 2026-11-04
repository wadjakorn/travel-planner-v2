// Hotel + transport booking mutation service for the REST API. Trip-scoped,
// soft-deleted. Authz + touchTrip + audit, mirroring the web actions.

import 'server-only';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { hotelBookings, transportBookings, type HotelBooking } from '@/db/schema';
import { parseHotelStatus, hotelNameFor } from '@/lib/api/hotel-input';
import { touchTrip } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
import { isUndoable } from '@/lib/undo';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { ServiceError } from './service-error';
import { requireTripAccess } from './access';
import { normalizeCurrencyField } from './normalize-currency';

// Writable columns accepted from a request. Server-managed columns
// (id/tripId/timestamps/deletedAt) are never taken from the client.
const HOTEL_FIELDS = [
  'dayIdx', 'name', 'address', 'lat', 'lng', 'placeIdExternal',
  'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime', 'nights',
  'room', 'guests', 'ref', 'costAmount', 'costCurrency', 'cancellation',
  'contact', 'notes', 'thumb', 'arrivalMode', 'departureMode',
  'attachmentName', 'attachmentSize', 'status', 'area',
] as const;

// Set by the server only (geocoded/viewport coords); never read from a body.
export type HotelServerFields = { coordsApprox?: boolean };

const TRANSPORT_FIELDS = [
  'dayIdx', 'type', 'title', 'provider', 'ref', 'fromCode', 'fromName',
  'fromTime', 'fromDate', 'fromTerminal', 'toCode', 'toName', 'toTime',
  'toDate', 'toTerminal', 'duration', 'seats', 'bag', 'costAmount',
  'costCurrency', 'fromLat', 'fromLng', 'fromPlaceId', 'toLat', 'toLng',
  'toPlaceId',
] as const;

// Undo of a delete (TP-0091). The same write check as the delete runs before
// anything about the row's delete state is revealed, and the trip is the
// booking's own, so a booking id cannot be restored into another trip. The
// UPDATE re-checks deletedAt so a double undo restores (and audits) once.
const nothingToUndo = () => new ServiceError('not_found', 'Nothing to undo');

function pick<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
  keys: readonly string[],
): T {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k];
  return out as T;
}

// ── Hotels ──────────────────────────────────────────────────────────────────

export async function listHotels(userId: string, tripId: string) {
  await requireTripAccess(userId, tripId, 'read');
  return db
    .select()
    .from(hotelBookings)
    .where(and(eq(hotelBookings.tripId, tripId), isNull(hotelBookings.deletedAt)))
    .orderBy(asc(hotelBookings.createdAt));
}

export async function createHotel(
  userId: string,
  tripId: string,
  body: Record<string, unknown>,
  exec: IdemExecutor = db,
  server: HotelServerFields = {},
) {
  await requireTripAccess(userId, tripId, 'write', exec);
  const fields = pick<Record<string, unknown>>(body, HOTEL_FIELDS);
  normalizeCurrencyField(fields, 'costCurrency');
  const status = parseHotelStatus(fields.status);
  if (status) fields.status = status;
  else delete fields.status;
  const name = hotelNameFor(fields);
  const [row] = await (exec as typeof db)
    .insert(hotelBookings)
    .values({ ...fields, ...server, tripId, name })
    .returning();
  await touchTrip(tripId, exec);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'hotel', entityId: row.id });
  return row;
}

async function resolveHotel(id: string) {
  const [row] = await db
    .select({ tripId: hotelBookings.tripId })
    .from(hotelBookings)
    .where(and(eq(hotelBookings.id, id), isNull(hotelBookings.deletedAt)))
    .limit(1);
  if (!row) throw new ServiceError('not_found', 'Hotel booking not found');
  return row.tripId;
}

export async function updateHotel(
  userId: string,
  id: string,
  body: Record<string, unknown>,
  server: HotelServerFields = {},
) {
  const tripId = await resolveHotel(id);
  await requireTripAccess(userId, tripId, 'write');
  const fields = pick<Record<string, unknown>>(body, HOTEL_FIELDS);
  normalizeCurrencyField(fields, 'costCurrency');
  // Partial patch: only validate status when sent; never default it.
  if ('status' in body) {
    const status = parseHotelStatus(body.status);
    if (status) fields.status = status;
    else delete fields.status;
  }
  if ('name' in fields && (typeof fields.name !== 'string' || !fields.name.trim())) {
    throw new ServiceError('bad_request', '"name" must not be empty');
  }
  const [row] = await db
    .update(hotelBookings)
    .set({ ...fields, ...server, updatedAt: new Date() })
    .where(eq(hotelBookings.id, id))
    .returning();
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'update', entityType: 'hotel', entityId: id });
  return row;
}

// Authz-checked read of the full live row, for callers that merge a patch
// with stored values before calling updateHotel.
export async function getHotelForWrite(userId: string, id: string): Promise<HotelBooking> {
  const tripId = await resolveHotel(id);
  await requireTripAccess(userId, tripId, 'write');
  const [row] = await db
    .select()
    .from(hotelBookings)
    .where(and(eq(hotelBookings.id, id), isNull(hotelBookings.deletedAt)))
    .limit(1);
  if (!row) throw new ServiceError('not_found', 'Hotel booking not found');
  return row;
}

export async function removeHotel(userId: string, id: string) {
  const tripId = await resolveHotel(id);
  await requireTripAccess(userId, tripId, 'write');
  await db
    .update(hotelBookings)
    .set({ deletedAt: new Date() })
    .where(eq(hotelBookings.id, id));
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'remove', entityType: 'hotel', entityId: id });
  return { tripId };
}

export async function restoreHotel(userId: string, id: string) {
  const [row] = await db
    .select({ tripId: hotelBookings.tripId, deletedAt: hotelBookings.deletedAt })
    .from(hotelBookings)
    .where(eq(hotelBookings.id, id))
    .limit(1);
  if (!row) throw nothingToUndo();
  await requireTripAccess(userId, row.tripId, 'write');
  if (!isUndoable(row.deletedAt, new Date())) throw nothingToUndo();
  const restored = await db
    .update(hotelBookings)
    .set({ deletedAt: null })
    .where(
      and(
        eq(hotelBookings.id, id),
        eq(hotelBookings.tripId, row.tripId),
        isNotNull(hotelBookings.deletedAt),
      ),
    )
    .returning({ id: hotelBookings.id });
  if (restored.length === 0) throw nothingToUndo();
  await touchTrip(row.tripId);
  await writeAudit({
    tripId: row.tripId,
    userId,
    action: 'update',
    entityType: 'hotel',
    entityId: id,
    after: { restored: true },
  });
  return { tripId: row.tripId };
}

// ── Transport ─────────────────────────────────────────────────────────────

const TRANSPORT_TYPES = ['flight', 'train', 'car', 'ferry'];

function checkEndCoords(fields: Record<string, unknown>, end: 'from' | 'to'): void {
  const latK = `${end}Lat`;
  const lngK = `${end}Lng`;
  const idK = `${end}PlaceId`;
  const hasLat = fields[latK] !== undefined;
  const hasLng = fields[lngK] !== undefined;
  if (hasLat || hasLng) {
    if (!hasLat || !hasLng) {
      throw new ServiceError('bad_request', `"${latK}" and "${lngK}" go together`);
    }
    const lat = fields[latK];
    const lng = fields[lngK];
    const num = (v: unknown, max: number) =>
      typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
    if (lat !== null && !num(lat, 90)) {
      throw new ServiceError('bad_request', `"${latK}" must be a number from -90 to 90`);
    }
    if (lng !== null && !num(lng, 180)) {
      throw new ServiceError('bad_request', `"${lngK}" must be a number from -180 to 180`);
    }
    if ((lat === null) !== (lng === null)) {
      throw new ServiceError('bad_request', `"${latK}" and "${lngK}" go together`);
    }
    // A null pair clears the end; a new pair without an id never keeps a stale one.
    if (lat === null) fields[idK] = null;
    else if (fields[idK] === undefined) fields[idK] = null;
  }
  const id = fields[idK];
  if (id !== undefined && id !== null && (typeof id !== 'string' || id.length > 512)) {
    throw new ServiceError('bad_request', `"${idK}" must be a string of at most 512 characters`);
  }
}

// Pure checks shared by create and PATCH: currency, endpoint coordinates.
// Mutates `fields` (normalised currency, placeId nulling).
export function validateTransportFields(fields: Record<string, unknown>): void {
  normalizeCurrencyField(fields, 'costCurrency');
  checkEndCoords(fields, 'from');
  checkEndCoords(fields, 'to');
}

// Pure PATCH validation (no DB, no auth) so callers can reject before any lookup.
export function parseTransportPatch(body: Record<string, unknown>) {
  const fields = pick<Record<string, unknown>>(body, TRANSPORT_FIELDS);
  validateTransportFields(fields);
  if (
    fields.type !== undefined &&
    (typeof fields.type !== 'string' || !TRANSPORT_TYPES.includes(fields.type))
  ) {
    throw new ServiceError('bad_request', 'invalid "type"');
  }
  return fields;
}

// Pure validation + value shaping for one transport booking. Shared by the
// single-entity create path and the plan importer (TP-0040), so both reject the
// same bad shapes with the same messages. No DB, no auth.
export function parseTransportInput(body: Record<string, unknown>) {
  const fields = pick<Record<string, unknown>>(body, TRANSPORT_FIELDS);
  validateTransportFields(fields);
  if (typeof fields.type !== 'string' || !TRANSPORT_TYPES.includes(fields.type)) {
    throw new ServiceError('bad_request', '"type" must be flight, train, car, or ferry');
  }
  if (typeof fields.title !== 'string' || !fields.title.trim()) {
    throw new ServiceError('bad_request', '"title" is required');
  }
  return {
    ...fields,
    type: fields.type as 'flight' | 'train' | 'car' | 'ferry',
    title: fields.title,
  };
}

export async function listTransport(userId: string, tripId: string) {
  await requireTripAccess(userId, tripId, 'read');
  return db
    .select()
    .from(transportBookings)
    .where(
      and(eq(transportBookings.tripId, tripId), isNull(transportBookings.deletedAt)),
    )
    .orderBy(asc(transportBookings.createdAt));
}

export async function createTransport(
  userId: string,
  tripId: string,
  body: Record<string, unknown>,
  exec: IdemExecutor = db,
) {
  await requireTripAccess(userId, tripId, 'write', exec);
  const values = parseTransportInput(body);
  const [row] = await (exec as typeof db)
    .insert(transportBookings)
    .values({ ...values, tripId })
    .returning();
  await touchTrip(tripId, exec);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'transport', entityId: row.id });
  return row;
}

export async function resolveTransport(id: string) {
  const [row] = await db
    .select({ tripId: transportBookings.tripId })
    .from(transportBookings)
    .where(and(eq(transportBookings.id, id), isNull(transportBookings.deletedAt)))
    .limit(1);
  if (!row) throw new ServiceError('not_found', 'Transport booking not found');
  return row.tripId;
}

export async function updateTransport(
  userId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const tripId = await resolveTransport(id);
  await requireTripAccess(userId, tripId, 'write');
  const fields = parseTransportPatch(body);
  const [row] = await db
    .update(transportBookings)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(transportBookings.id, id))
    .returning();
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'update', entityType: 'transport', entityId: id });
  return row;
}

export async function removeTransport(userId: string, id: string) {
  const tripId = await resolveTransport(id);
  await requireTripAccess(userId, tripId, 'write');
  await db
    .update(transportBookings)
    .set({ deletedAt: new Date() })
    .where(eq(transportBookings.id, id));
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'remove', entityType: 'transport', entityId: id });
  return { tripId };
}

export async function restoreTransport(userId: string, id: string) {
  const [row] = await db
    .select({ tripId: transportBookings.tripId, deletedAt: transportBookings.deletedAt })
    .from(transportBookings)
    .where(eq(transportBookings.id, id))
    .limit(1);
  if (!row) throw nothingToUndo();
  await requireTripAccess(userId, row.tripId, 'write');
  if (!isUndoable(row.deletedAt, new Date())) throw nothingToUndo();
  const restored = await db
    .update(transportBookings)
    .set({ deletedAt: null })
    .where(
      and(
        eq(transportBookings.id, id),
        eq(transportBookings.tripId, row.tripId),
        isNotNull(transportBookings.deletedAt),
      ),
    )
    .returning({ id: transportBookings.id });
  if (restored.length === 0) throw nothingToUndo();
  await touchTrip(row.tripId);
  await writeAudit({
    tripId: row.tripId,
    userId,
    action: 'update',
    entityType: 'transport',
    entityId: id,
    after: { restored: true },
  });
  return { tripId: row.tripId };
}
