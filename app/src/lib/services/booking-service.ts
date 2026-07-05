// Hotel + transport booking mutation service for the REST API. Trip-scoped,
// soft-deleted. Authz + touchTrip + audit, mirroring the web actions.

import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { hotelBookings, transportBookings } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
import { ServiceError } from './service-error';
import { requireTripAccess } from './access';

// Writable columns accepted from a request. Server-managed columns
// (id/tripId/timestamps/deletedAt) are never taken from the client.
const HOTEL_FIELDS = [
  'dayIdx', 'name', 'address', 'lat', 'lng', 'placeIdExternal',
  'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime', 'nights',
  'room', 'guests', 'ref', 'costAmount', 'costCurrency', 'cancellation',
  'contact', 'notes', 'thumb', 'arrivalMode', 'departureMode',
] as const;

const TRANSPORT_FIELDS = [
  'dayIdx', 'type', 'title', 'provider', 'ref', 'fromCode', 'fromName',
  'fromTime', 'fromDate', 'fromTerminal', 'toCode', 'toName', 'toTime',
  'toDate', 'toTerminal', 'duration', 'seats', 'bag', 'costAmount',
  'costCurrency',
] as const;

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
) {
  await requireTripAccess(userId, tripId, 'write');
  const fields = pick(body, HOTEL_FIELDS);
  if (typeof fields.name !== 'string' || !fields.name.trim()) {
    throw new ServiceError('bad_request', '"name" is required');
  }
  const [row] = await db
    .insert(hotelBookings)
    .values({ ...fields, tripId, name: fields.name })
    .returning();
  await touchTrip(tripId);
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
) {
  const tripId = await resolveHotel(id);
  await requireTripAccess(userId, tripId, 'write');
  const fields = pick(body, HOTEL_FIELDS);
  const [row] = await db
    .update(hotelBookings)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(hotelBookings.id, id))
    .returning();
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'update', entityType: 'hotel', entityId: id });
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

// ── Transport ─────────────────────────────────────────────────────────────

const TRANSPORT_TYPES = ['flight', 'train', 'car', 'ferry'];

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
) {
  await requireTripAccess(userId, tripId, 'write');
  const fields = pick(body, TRANSPORT_FIELDS);
  if (typeof fields.type !== 'string' || !TRANSPORT_TYPES.includes(fields.type)) {
    throw new ServiceError('bad_request', '"type" must be flight, train, car, or ferry');
  }
  if (typeof fields.title !== 'string' || !fields.title.trim()) {
    throw new ServiceError('bad_request', '"title" is required');
  }
  const [row] = await db
    .insert(transportBookings)
    .values({ ...fields, tripId, type: fields.type as 'flight' | 'train' | 'car' | 'ferry', title: fields.title })
    .returning();
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'transport', entityId: row.id });
  return row;
}

async function resolveTransport(id: string) {
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
  const fields = pick(body, TRANSPORT_FIELDS);
  if (
    fields.type !== undefined &&
    (typeof fields.type !== 'string' || !TRANSPORT_TYPES.includes(fields.type))
  ) {
    throw new ServiceError('bad_request', 'invalid "type"');
  }
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
