// /trip/[id]/calendar — Phase 7A read-only month calendar.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getTripRole } from '@/lib/trip-access';
import { TripRail } from '@/components/trip-rail';
import { CalendarView } from '@/components/calendar-view';
import { loadCalendarEvents } from '@/lib/calendar-queries';
import { loadTripBasic, loadBookingCounts } from '@/lib/trip-queries';

export const metadata: Metadata = { title: 'Calendar' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ym?: string }>;

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;
  const { ym } = await searchParams;

  const trip = await loadTripBasic(tripId);
  if (!trip) notFound();
  if (!(await getTripRole(trip.id, user.id))) notFound();

  const [events, counts] = await Promise.all([
    loadCalendarEvents(tripId),
    loadBookingCounts(tripId),
  ]);

  let year: number;
  let month: number;
  const m = ym ? /^(\d{4})-(\d{2})$/.exec(ym) : null;
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
  } else if (trip.startDate) {
    const [y, mm] = trip.startDate.split('-');
    year = Number(y);
    month = Number(mm);
  } else {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth() + 1;
  }

  const today = new Date();
  const todayIso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;

  return (
    <>
      <TripRail tripId={tripId} active="calendar" counts={counts} />
      <div className="flex-1">
        <CalendarView
          tripId={tripId}
          year={year}
          month={month}
          tripStart={trip.startDate}
          tripEnd={trip.endDate}
          events={events}
          todayIso={todayIso}
        />
      </div>
    </>
  );
}
