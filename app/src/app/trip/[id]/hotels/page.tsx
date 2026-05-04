// /trip/[id]/hotels — read-only hotels view (Phase 3A).

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { TripRail } from '@/components/trip-rail';
import { HotelsView } from '@/components/hotels-view';
import {
  loadHotelsForTrip,
  loadTripBasic,
  loadBookingCounts,
} from '@/lib/trip-queries';
import { removeHotelAction } from '@/app/actions/bookings';

export const metadata: Metadata = { title: 'Hotels' };

type Params = Promise<{ id: string }>;

export default async function HotelsPage({ params }: { params: Params }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;

  const trip = await loadTripBasic(tripId);
  if (!trip) notFound();
  const role = await getTripRole(trip.id, user.id);
  if (!role) notFound();
  const canEdit = canWrite(role);

  const [hotels, counts] = await Promise.all([
    loadHotelsForTrip(tripId),
    loadBookingCounts(tripId),
  ]);

  return (
    <>
      <TripRail tripId={tripId} active="hotels" counts={counts} />
      <div className="flex-1">
        <HotelsView
          tripId={tripId}
          hotels={hotels}
          editHrefBase={`/trip/${tripId}/booking/hotel`}
          removeAction={removeHotelAction}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
