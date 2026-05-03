// /trip/[id]/hotels — read-only hotels view (Phase 3A).

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { Header } from '@/components/header';
import { TripNav } from '@/components/trip-nav';
import { HotelsView } from '@/components/hotels-view';
import { loadHotelsForTrip } from '@/lib/trip-queries';
import { removeHotelAction } from '@/app/actions/bookings';

export const metadata: Metadata = { title: 'Hotels' };

type Params = Promise<{ id: string }>;

export default async function HotelsPage({ params }: { params: Params }) {
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

  const hotels = await loadHotelsForTrip(tripId);

  return (
    <>
      <Header
        user={user}
        tripTitle={trip.title}
        tripUpdatedAt={trip.updatedAt.toISOString()}
      />
      <TripNav tripId={tripId} active="hotels" />
      <HotelsView
        tripId={tripId}
        hotels={hotels}
        editHrefBase={`/trip/${tripId}/booking/hotel`}
        removeAction={removeHotelAction}
      />
    </>
  );
}
