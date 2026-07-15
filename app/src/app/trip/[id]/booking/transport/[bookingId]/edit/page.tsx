import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { db } from '@/db';
import { transportBookings, trips } from '@/db/schema';
import { TransportForm } from '@/components/transport-form';
import { updateTransportAction, removeTransportRedirectAction } from '@/app/actions/bookings';

export const metadata: Metadata = { title: 'Edit transport' };

type Params = Promise<{ id: string; bookingId: string }>;

export default async function EditTransportPage({
  params,
}: {
  params: Params;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const { id: tripId, bookingId } = await params;

  const row = await db
    .select({ booking: transportBookings, ownerId: trips.ownerId })
    .from(transportBookings)
    .innerJoin(trips, eq(trips.id, transportBookings.tripId))
    .where(eq(transportBookings.id, bookingId))
    .limit(1);

  const r = row[0];
  if (!r || r.booking.tripId !== tripId) notFound();
  if (!canWrite(await getTripRole(tripId, session.user.id))) notFound();

  const b = r.booking;
  return (
    <TransportForm
      mode="edit"
      action={updateTransportAction}
      deleteAction={removeTransportRedirectAction}
      hidden={{ bookingId }}
      initial={{
        type: b.type,
        title: b.title,
        provider: b.provider,
        ref: b.ref,
        fromCode: b.fromCode,
        fromName: b.fromName,
        fromTime: b.fromTime,
        fromDate: b.fromDate,
        fromTerminal: b.fromTerminal,
        toCode: b.toCode,
        toName: b.toName,
        toTime: b.toTime,
        toDate: b.toDate,
        toTerminal: b.toTerminal,
        duration: b.duration,
        seats: b.seats,
        bag: b.bag,
        costAmount: b.costAmount,
        costCurrency: b.costCurrency,
      }}
      cancelHref={`/trip/${tripId}/bookings`}
    />
  );
}
