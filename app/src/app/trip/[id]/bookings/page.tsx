// /trip/[id]/bookings — consolidated Bookings (stays + transport) view.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { loadTripCurrency } from '@/lib/expense-queries';
import { BookingsView } from '@/components/bookings-view';
import { loadBookingsForTrip, loadTripBasic } from '@/lib/trip-queries';
import {
  removeHotelAction,
  removeTransportAction,
  restoreHotelAction,
  restoreTransportAction,
  addHotelInlineAction,
  updateHotelInlineAction,
  addTransportInlineAction,
  updateTransportInlineAction,
} from '@/app/actions/bookings';

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

  const [items, tripCurrency] = await Promise.all([
    loadBookingsForTrip(tripId),
    loadTripCurrency(tripId, trip.currency),
  ]);

  return (
    <>
      <div className="flex-1">
        <BookingsView
          tripId={tripId}
          items={items}
          tripName={trip.title}
          tripCurrency={tripCurrency}
          tripStart={trip.startDate}
          tripEnd={trip.endDate}
          removeHotelAction={removeHotelAction}
          removeTransportAction={removeTransportAction}
          restoreHotelAction={restoreHotelAction}
          restoreTransportAction={restoreTransportAction}
          addHotelInlineAction={addHotelInlineAction}
          updateHotelInlineAction={updateHotelInlineAction}
          addTransportInlineAction={addTransportInlineAction}
          updateTransportInlineAction={updateTransportInlineAction}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
