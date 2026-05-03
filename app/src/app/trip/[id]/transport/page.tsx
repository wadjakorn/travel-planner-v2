// /trip/[id]/transport — read-only transport view (Phase 3A).

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { Header } from '@/components/header';
import { TripNav } from '@/components/trip-nav';
import { TransportView } from '@/components/transport-view';
import { loadTransportForTrip } from '@/lib/trip-queries';
import { removeTransportAction } from '@/app/actions/bookings';

export const metadata: Metadata = { title: 'Transport' };

type Params = Promise<{ id: string }>;

export default async function TransportPage({ params }: { params: Params }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;

  const tripRow = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const trip = tripRow[0];
  if (!trip || trip.ownerId !== user.id) notFound();

  const bookings = await loadTransportForTrip(tripId);

  return (
    <>
      <Header
        user={user}
        tripTitle={trip.title}
        tripUpdatedAt={trip.updatedAt.toISOString()}
      />
      <TripNav tripId={tripId} active="transport" />
      <TransportView
        tripId={tripId}
        bookings={bookings}
        editHrefBase={`/trip/${tripId}/booking/transport`}
        removeAction={removeTransportAction}
      />
    </>
  );
}
