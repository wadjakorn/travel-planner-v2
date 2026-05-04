import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { db } from '@/db';
import { hotelBookings, trips } from '@/db/schema';
import { HotelForm } from '@/components/hotel-form';
import { updateHotelAction } from '@/app/actions/bookings';

export const metadata: Metadata = { title: 'Edit hotel' };

type Params = Promise<{ id: string; bookingId: string }>;

export default async function EditHotelPage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const { id: tripId, bookingId } = await params;

  const row = await db
    .select({ booking: hotelBookings, ownerId: trips.ownerId })
    .from(hotelBookings)
    .innerJoin(trips, eq(trips.id, hotelBookings.tripId))
    .where(eq(hotelBookings.id, bookingId))
    .limit(1);

  const r = row[0];
  if (!r || r.booking.tripId !== tripId) notFound();
  if (!canWrite(await getTripRole(tripId, session.user.id))) notFound();

  const b = r.booking;
  return (
    <HotelForm
      mode="edit"
      action={updateHotelAction}
      hidden={{ bookingId }}
      initial={{
        dayIdx: b.dayIdx,
        name: b.name,
        address: b.address,
        checkInDate: b.checkInDate,
        checkInTime: b.checkInTime,
        checkOutDate: b.checkOutDate,
        checkOutTime: b.checkOutTime,
        nights: b.nights,
        room: b.room,
        guests: b.guests,
        ref: b.ref,
        costAmount: b.costAmount,
        costCurrency: b.costCurrency,
        cancellation: b.cancellation,
        contact: b.contact,
        notes: b.notes,
        attachmentName: b.attachmentName,
        attachmentSize: b.attachmentSize,
        thumb: b.thumb,
      }}
      cancelHref={`/trip/${tripId}/hotels`}
    />
  );
}
