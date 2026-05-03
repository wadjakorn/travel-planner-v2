'use server';

// Booking server actions. Phase 3A ships read + soft-delete only.
// Phase 3B adds the multi-step add flow + edit. Phase 3C wires
// inline place.booking summary refresh.

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { hotelBookings, transportBookings, trips } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

async function ownsHotel(
  userId: string,
  bookingId: string,
): Promise<{ tripId: string } | null> {
  const row = await db
    .select({ tripId: hotelBookings.tripId, ownerId: trips.ownerId })
    .from(hotelBookings)
    .innerJoin(trips, eq(trips.id, hotelBookings.tripId))
    .where(eq(hotelBookings.id, bookingId))
    .limit(1);
  const r = row[0];
  if (!r || r.ownerId !== userId) return null;
  return { tripId: r.tripId };
}

async function ownsTransport(
  userId: string,
  bookingId: string,
): Promise<{ tripId: string } | null> {
  const row = await db
    .select({ tripId: transportBookings.tripId, ownerId: trips.ownerId })
    .from(transportBookings)
    .innerJoin(trips, eq(trips.id, transportBookings.tripId))
    .where(eq(transportBookings.id, bookingId))
    .limit(1);
  const r = row[0];
  if (!r || r.ownerId !== userId) return null;
  return { tripId: r.tripId };
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

  revalidatePath(`/trip/${owned.tripId}/transport`);
  revalidatePath(`/trip/${owned.tripId}`);
}
