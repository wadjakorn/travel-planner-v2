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

export async function addHotelAction(formData: FormData) {
  const userId = await requireUserId();
  const tripId = requireTripId(formData);
  await createHotel(userId, tripId, readHotelFields(formData));
  revalidateHotels(tripId);
  redirect(`/trip/${tripId}/bookings`);
}

export async function addHotelInlineAction(formData: FormData) {
  // Same as addHotelAction but no redirect — used by overlay picker so the
  // current page stays put after add.
  const userId = await requireUserId();
  const tripId = requireTripId(formData);
  await createHotel(userId, tripId, readHotelFields(formData));
  revalidateHotels(tripId);
}

export async function updateHotelInlineAction(formData: FormData) {
  // Minimal-edit hotel update — only patches fields present in the form.
  // Used by overlay edit modal (search-sourced row: dates only;
  // manual row: name/address/lat/lng/dates).
  const userId = await requireUserId();
  const bookingId = requireBookingId(formData);

  const patch: Record<string, unknown> = {};
  // Dates always editable.
  if (formData.has('checkInDate')) patch.checkInDate = trimOrNull(formData.get('checkInDate'));
  if (formData.has('checkInTime')) patch.checkInTime = trimOrNull(formData.get('checkInTime'));
  if (formData.has('checkOutDate')) patch.checkOutDate = trimOrNull(formData.get('checkOutDate'));
  if (formData.has('checkOutTime')) patch.checkOutTime = trimOrNull(formData.get('checkOutTime'));
  // Manual-only fields — only patched when sent.
  if (formData.has('name')) {
    const name = trimOrNull(formData.get('name'));
    if (!name) throw new Error('Name is required');
    patch.name = name;
  }
  if (formData.has('address')) patch.address = trimOrNull(formData.get('address'));
  if (formData.has('lat')) patch.lat = parseNumber(formData.get('lat'));
  if (formData.has('lng')) patch.lng = parseNumber(formData.get('lng'));

  const { tripId } = await updateHotel(userId, bookingId, patch);
  revalidateHotels(tripId);
}

export async function updateHotelAction(formData: FormData) {
  const userId = await requireUserId();
  const bookingId = requireBookingId(formData);
  const { tripId } = await updateHotel(userId, bookingId, readHotelFields(formData));
  revalidateHotels(tripId);
  redirect(`/trip/${tripId}/bookings`);
}

export async function addTransportAction(formData: FormData) {
  const userId = await requireUserId();
  const tripId = requireTripId(formData);
  await createTransport(userId, tripId, readTransportFields(formData));
  revalidateTransport(tripId);
  redirect(`/trip/${tripId}/bookings`);
}

export async function updateTransportAction(formData: FormData) {
  const userId = await requireUserId();
  const bookingId = requireBookingId(formData);
  const { tripId } = await updateTransport(userId, bookingId, readTransportFields(formData));
  revalidateTransport(tripId);
  redirect(`/trip/${tripId}/bookings`);
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
