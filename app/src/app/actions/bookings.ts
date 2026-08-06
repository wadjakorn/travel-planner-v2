'use server';

// Booking server actions. Thin FormData → service adapters: authz, DB writes,
// touchTrip and audit all live in booking-service (shared with the REST API).
// Actions own only FormData parsing, revalidation and redirects.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/with-trip-auth';
import {
  createHotel,
  updateHotel,
  removeHotel,
  createTransport,
  updateTransport,
  removeTransport,
} from '@/lib/services/booking-service';
import { trimOrNull, parseNumber, parseInt32 } from '@/lib/form-parsers';

const TRANSPORT_TYPES = ['flight', 'train', 'car', 'ferry'] as const;
type TransportType = (typeof TRANSPORT_TYPES)[number];

function parseTransportType(v: FormDataEntryValue | null): TransportType {
  if (typeof v !== 'string' || !TRANSPORT_TYPES.includes(v as TransportType)) {
    throw new Error('Invalid transport type');
  }
  return v as TransportType;
}

function readHotelFields(formData: FormData) {
  return {
    dayIdx: parseInt32(formData.get('dayIdx')),
    name: trimOrNull(formData.get('name')) ?? '',
    address: trimOrNull(formData.get('address')),
    lat: parseNumber(formData.get('lat')),
    lng: parseNumber(formData.get('lng')),
    placeIdExternal: trimOrNull(formData.get('placeIdExternal')),
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
  };
}

function requireTripId(formData: FormData): string {
  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');
  return tripId;
}

function requireBookingId(formData: FormData): string {
  const bookingId = trimOrNull(formData.get('bookingId'));
  if (!bookingId) throw new Error('bookingId required');
  return bookingId;
}

function revalidateHotels(tripId: string) {
  revalidatePath(`/trip/${tripId}/bookings`);
  revalidatePath(`/trip/${tripId}/hotels`);
  revalidatePath(`/trip/${tripId}`);
}

function revalidateTransport(tripId: string) {
  revalidatePath(`/trip/${tripId}/bookings`);
  revalidatePath(`/trip/${tripId}/transport`);
  revalidatePath(`/trip/${tripId}`);
}

async function persistAddHotel(formData: FormData): Promise<string> {
  const userId = await requireUserId();
  const tripId = requireTripId(formData);
  await createHotel(userId, tripId, readHotelFields(formData));
  revalidateHotels(tripId);
  return tripId;
}

export async function addHotelAction(formData: FormData) {
  const tripId = await persistAddHotel(formData);
  redirect(`/trip/${tripId}/bookings`);
}

export async function addHotelInlineAction(formData: FormData) {
  // Same as addHotelAction but no redirect — the overlay stays on the
  // bookings page and repaints from revalidatePath alone.
  await persistAddHotel(formData);
}

async function persistUpdateHotel(formData: FormData): Promise<string> {
  const userId = await requireUserId();
  const bookingId = requireBookingId(formData);
  const { tripId } = await updateHotel(userId, bookingId, readHotelFields(formData));
  revalidateHotels(tripId);
  return tripId;
}

export async function updateHotelAction(formData: FormData) {
  const tripId = await persistUpdateHotel(formData);
  redirect(`/trip/${tripId}/bookings`);
}

export async function updateHotelInlineAction(formData: FormData) {
  // Same as updateHotelAction but no redirect — full-replacement patch (same
  // field set as readHotelFields), not the narrower partial patch the old
  // inline action used. A field the user clears must not silently keep its
  // old DB value.
  await persistUpdateHotel(formData);
}

async function persistAddTransport(formData: FormData): Promise<string> {
  const userId = await requireUserId();
  const tripId = requireTripId(formData);
  await createTransport(userId, tripId, readTransportFields(formData));
  revalidateTransport(tripId);
  return tripId;
}

export async function addTransportAction(formData: FormData) {
  const tripId = await persistAddTransport(formData);
  redirect(`/trip/${tripId}/bookings`);
}

export async function addTransportInlineAction(formData: FormData) {
  // Same as addTransportAction but no redirect — the overlay stays on the
  // bookings page and repaints from revalidatePath alone.
  await persistAddTransport(formData);
}

async function persistUpdateTransport(formData: FormData): Promise<string> {
  const userId = await requireUserId();
  const bookingId = requireBookingId(formData);
  const { tripId } = await updateTransport(userId, bookingId, readTransportFields(formData));
  revalidateTransport(tripId);
  return tripId;
}

export async function updateTransportAction(formData: FormData) {
  const tripId = await persistUpdateTransport(formData);
  redirect(`/trip/${tripId}/bookings`);
}

export async function updateTransportInlineAction(formData: FormData) {
  // Same as updateTransportAction but no redirect — the overlay stays on the
  // bookings page and repaints from revalidatePath alone.
  await persistUpdateTransport(formData);
}

export async function removeHotelAction(formData: FormData) {
  const userId = await requireUserId();
  const bookingId = requireBookingId(formData);
  const { tripId } = await removeHotel(userId, bookingId);
  revalidateHotels(tripId);
}

// Delete + redirect — used by the edit form's "Delete hotel" button, which must
// leave the (now-gone) edit page. The list uses removeHotelAction, which stays
// put and refreshes in place.
export async function removeHotelRedirectAction(formData: FormData) {
  const userId = await requireUserId();
  const bookingId = requireBookingId(formData);
  const { tripId } = await removeHotel(userId, bookingId);
  revalidateHotels(tripId);
  redirect(`/trip/${tripId}/bookings`);
}

export async function removeTransportAction(formData: FormData) {
  const userId = await requireUserId();
  const bookingId = requireBookingId(formData);
  const { tripId } = await removeTransport(userId, bookingId);
  revalidateTransport(tripId);
}

// Delete + redirect — used by the edit form's "Delete transport" button, which
// must leave the (now-gone) edit page. The list uses removeTransportAction,
// which stays put and refreshes in place.
export async function removeTransportRedirectAction(formData: FormData) {
  const userId = await requireUserId();
  const bookingId = requireBookingId(formData);
  const { tripId } = await removeTransport(userId, bookingId);
  revalidateTransport(tripId);
  redirect(`/trip/${tripId}/bookings`);
}
