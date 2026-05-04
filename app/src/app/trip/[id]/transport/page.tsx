// /trip/[id]/transport — read-only transport view (Phase 3A).

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { TripRail } from '@/components/trip-rail';
import { TransportView } from '@/components/transport-view';
import {
  loadTransportForTrip,
  loadTripBasic,
  loadBookingCounts,
} from '@/lib/trip-queries';
import { removeTransportAction } from '@/app/actions/bookings';

export const metadata: Metadata = { title: 'Transport' };

type Params = Promise<{ id: string }>;

export default async function TransportPage({ params }: { params: Params }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;

  const trip = await loadTripBasic(tripId);
  if (!trip) notFound();
  const role = await getTripRole(trip.id, user.id);
  if (!role) notFound();
  const canEdit = canWrite(role);

  const [bookings, counts] = await Promise.all([
    loadTransportForTrip(tripId),
    loadBookingCounts(tripId),
  ]);

  return (
    <>
      <TripRail tripId={tripId} active="transport" counts={counts} />
      <div className="flex-1">
        <TransportView
          tripId={tripId}
          bookings={bookings}
          editHrefBase={`/trip/${tripId}/booking/transport`}
          removeAction={removeTransportAction}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
