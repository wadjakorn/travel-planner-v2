// /trip/[id]/calendar — Phase 7A read-only month calendar.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { Header } from '@/components/header';
import { TripNav } from '@/components/trip-nav';
import { CalendarView } from '@/components/calendar-view';
import { loadCalendarEvents } from '@/lib/calendar-queries';

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

  const tripRow = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const trip = tripRow[0];
  if (!trip || trip.ownerId !== user.id) notFound();

  const events = await loadCalendarEvents(tripId);

  // Resolve year/month: ?ym=YYYY-MM > trip.startDate's month > today.
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
      <Header
        user={user}
        tripTitle={trip.title}
        tripUpdatedAt={trip.updatedAt.toISOString()}
      />
      <TripNav tripId={tripId} active="calendar" />
      <CalendarView
        tripId={tripId}
        year={year}
        month={month}
        tripStart={trip.startDate}
        tripEnd={trip.endDate}
        events={events}
        todayIso={todayIso}
      />
    </>
  );
}
