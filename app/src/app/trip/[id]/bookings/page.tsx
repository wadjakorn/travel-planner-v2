// /trip/[id]/bookings — consolidated Bookings (stays + transport) view.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { TripRail } from '@/components/trip-rail';
import { BookingsView } from '@/components/bookings-view';
import { loadBookingsForTrip, loadTripBasic, loadBookingCounts } from '@/lib/trip-queries';
import { removeHotelAction, removeTransportAction } from '@/app/actions/bookings';

export const metadata: Metadata = { title: 'Bookings' };

type Params = Promise<{ id: string }>;

export default async function BookingsPage({ params }: { params: Params }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;

  const trip = await loadTripBasic(tripId);
  if (!trip) notFound();
  const role = await getTripRole(trip.id, user.id);
  if (!role) notFound();
  const canEdit = canWrite(role);

  const [items, counts] = await Promise.all([
    loadBookingsForTrip(tripId),
    loadBookingCounts(tripId),
  ]);

  return (
    <>
      <TripRail tripId={tripId} active="bookings" counts={counts} />
      <div className="flex-1">
        <BookingsView
          tripId={tripId}
          items={items}
          tripName={trip.title}
          removeHotelAction={removeHotelAction}
          removeTransportAction={removeTransportAction}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
