'use server';

// Booking server actions. Phase 3A read + delete; Phase 3B add + edit.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import {
  hotelBookings,
  transportBookings,
} from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';

const TRANSPORT_TYPES = ['flight', 'train', 'car', 'ferry'] as const;
type TransportType = (typeof TRANSPORT_TYPES)[number];

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseNumber(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseInt32(v: FormDataEntryValue | null): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n);
}

function parseTransportType(v: FormDataEntryValue | null): TransportType {
  if (typeof v !== 'string' || !TRANSPORT_TYPES.includes(v as TransportType)) {
    throw new Error('Invalid transport type');
  }
  return v as TransportType;
}

async function ownsTrip(
  userId: string,
  tripId: string,
): Promise<boolean> {
  return canWrite(await getTripRole(tripId, userId));
}

async function ownsHotel(
  userId: string,
  bookingId: string,
): Promise<{ tripId: string } | null> {
  const row = await db
    .select({ tripId: hotelBookings.tripId })
    .from(hotelBookings)
    .where(eq(hotelBookings.id, bookingId))
    .limit(1);
  const r = row[0];
  if (!r) return null;
  if (!canWrite(await getTripRole(r.tripId, userId))) return null;
  return { tripId: r.tripId };
}

async function ownsTransport(
  userId: string,
  bookingId: string,
): Promise<{ tripId: string } | null> {
  const row = await db
    .select({ tripId: transportBookings.tripId })
    .from(transportBookings)
    .where(eq(transportBookings.id, bookingId))
    .limit(1);
  const r = row[0];
  if (!r) return null;
  if (!canWrite(await getTripRole(r.tripId, userId))) return null;
  return { tripId: r.tripId };
}

function readHotelFields(formData: FormData) {
  return {
    dayIdx: parseInt32(formData.get('dayIdx')),
    name: trimOrNull(formData.get('name')) ?? '',
    address: trimOrNull(formData.get('address')),
    checkInDate: trimOrNull(formData.get('checkInDate')),
    checkInTime: trimOrNull(formData.get('checkInTime')),
    checkOutDate: trimOrNull(formData.get('checkOutDate')),
    checkOutTime: trimOrNull(formData.get('checkOutTime')),
    nights: parseInt32(formData.get('nights')),
    room: trimOrNull(formData.get('room')),
    guests: parseInt32(formData.get('guests')),
    ref: trimOrNull(formData.get('ref')),
    costAmount: parseNumber(formData.get('costAmount')),
    costCurrency: trimOrNull(formData.get('costCurrency')),
    cancellation: trimOrNull(formData.get('cancellation')),
    contact: trimOrNull(formData.get('contact')),
    notes: trimOrNull(formData.get('notes')),
    attachmentName: trimOrNull(formData.get('attachmentName')),
    attachmentSize: trimOrNull(formData.get('attachmentSize')),
    thumb: trimOrNull(formData.get('thumb')),
  };
}

function readTransportFields(formData: FormData) {
  return {
    type: parseTransportType(formData.get('type')),
    dayIdx: parseInt32(formData.get('dayIdx')),
    title: trimOrNull(formData.get('title')) ?? '',
    provider: trimOrNull(formData.get('provider')),
    ref: trimOrNull(formData.get('ref')),
    fromCode: trimOrNull(formData.get('fromCode')),
    fromName: trimOrNull(formData.get('fromName')),
    fromTime: trimOrNull(formData.get('fromTime')),
    fromDate: trimOrNull(formData.get('fromDate')),
    fromTerminal: trimOrNull(formData.get('fromTerminal')),
    toCode: trimOrNull(formData.get('toCode')),
    toName: trimOrNull(formData.get('toName')),
    toTime: trimOrNull(formData.get('toTime')),
    toDate: trimOrNull(formData.get('toDate')),
    toTerminal: trimOrNull(formData.get('toTerminal')),
    duration: trimOrNull(formData.get('duration')),
    seats: trimOrNull(formData.get('seats')),
    bag: trimOrNull(formData.get('bag')),
    costAmount: parseNumber(formData.get('costAmount')),
    costCurrency: trimOrNull(formData.get('costCurrency')),
    attachmentName: trimOrNull(formData.get('attachmentName')),
    attachmentSize: trimOrNull(formData.get('attachmentSize')),
  };
}

export async function addHotelAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');
  if (!(await ownsTrip(session.user.id, tripId))) throw new Error('Forbidden');

  const fields = readHotelFields(formData);
  if (!fields.name) throw new Error('Name is required');

  const [created] = await db
    .insert(hotelBookings)
    .values({ ...fields, tripId })
    .returning({ id: hotelBookings.id });
  await touchTrip(tripId);
  await writeAudit({
    tripId,
    userId: session.user.id,
    action: 'add',
    entityType: 'hotel',
    entityId: created.id,
    after: { name: fields.name },
  });

  revalidatePath(`/trip/${tripId}/hotels`);
  revalidatePath(`/trip/${tripId}`);
  redirect(`/trip/${tripId}/hotels`);
}

export async function updateHotelAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const bookingId = trimOrNull(formData.get('bookingId'));
  if (!bookingId) throw new Error('bookingId required');

  const owned = await ownsHotel(session.user.id, bookingId);
  if (!owned) throw new Error('Forbidden');

  const fields = readHotelFields(formData);
  if (!fields.name) throw new Error('Name is required');

  await db
    .update(hotelBookings)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(hotelBookings.id, bookingId));
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'update',
    entityType: 'hotel',
    entityId: bookingId,
    after: { name: fields.name },
  });

  revalidatePath(`/trip/${owned.tripId}/hotels`);
  revalidatePath(`/trip/${owned.tripId}`);
  redirect(`/trip/${owned.tripId}/hotels`);
}

export async function addTransportAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');
  if (!(await ownsTrip(session.user.id, tripId))) throw new Error('Forbidden');

  const fields = readTransportFields(formData);
  if (!fields.title) throw new Error('Title is required');

  const [created] = await db
    .insert(transportBookings)
    .values({ ...fields, tripId })
    .returning({ id: transportBookings.id });
  await touchTrip(tripId);
  await writeAudit({
    tripId,
    userId: session.user.id,
    action: 'add',
    entityType: 'transport',
    entityId: created.id,
    after: { title: fields.title, type: fields.type },
  });

  revalidatePath(`/trip/${tripId}/transport`);
  revalidatePath(`/trip/${tripId}`);
  redirect(`/trip/${tripId}/transport`);
}

export async function updateTransportAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const bookingId = trimOrNull(formData.get('bookingId'));
  if (!bookingId) throw new Error('bookingId required');

  const owned = await ownsTransport(session.user.id, bookingId);
  if (!owned) throw new Error('Forbidden');

  const fields = readTransportFields(formData);
  if (!fields.title) throw new Error('Title is required');

  await db
    .update(transportBookings)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(transportBookings.id, bookingId));
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'update',
    entityType: 'transport',
    entityId: bookingId,
    after: { title: fields.title },
  });

  revalidatePath(`/trip/${owned.tripId}/transport`);
  revalidatePath(`/trip/${owned.tripId}`);
  redirect(`/trip/${owned.tripId}/transport`);
}

export async function removeHotelAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const bookingId = trimOrNull(formData.get('bookingId'));
  if (!bookingId) throw new Error('bookingId required');

  const owned = await ownsHotel(session.user.id, bookingId);
  if (!owned) throw new Error('Forbidden');

  await db
    .update(hotelBookings)
    .set({ deletedAt: new Date() })
    .where(and(eq(hotelBookings.id, bookingId)));
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'remove',
    entityType: 'hotel',
    entityId: bookingId,
  });

  revalidatePath(`/trip/${owned.tripId}/hotels`);
  revalidatePath(`/trip/${owned.tripId}`);
}

export async function removeTransportAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const bookingId = trimOrNull(formData.get('bookingId'));
  if (!bookingId) throw new Error('bookingId required');

  const owned = await ownsTransport(session.user.id, bookingId);
  if (!owned) throw new Error('Forbidden');

  await db
    .update(transportBookings)
    .set({ deletedAt: new Date() })
    .where(and(eq(transportBookings.id, bookingId)));
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId: session.user.id,
    action: 'remove',
    entityType: 'transport',
    entityId: bookingId,
  });

  revalidatePath(`/trip/${owned.tripId}/transport`);
  revalidatePath(`/trip/${owned.tripId}`);
}
