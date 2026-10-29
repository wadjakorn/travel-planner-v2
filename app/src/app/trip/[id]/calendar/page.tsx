// /trip/[id]/calendar — trip-range view (default for dated trips ≤ 31 days)
// or the month grid. `?view=trip|month` wins, then `?ym=` means month.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getTripRole } from '@/lib/trip-access';
import { CalendarView } from '@/components/calendar-view';
import {
  loadCalendarEvents,
  loadItineraryDays,
  loadItineraryStops,
  parseLooseDate,
} from '@/lib/calendar-queries';
import {
  buildTripRange,
  resolveCalendarView,
  tripRangeAvailable,
  tripRangeEnd,
} from '@/lib/calendar-trip-range';
import { loadTripBasic } from '@/lib/trip-queries';
import { getLang, tServer } from '@/lib/i18n';
import { localeTag } from '@/lib/week';

export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer();
  return { title: t('calendar') };
}

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ ym?: string; view?: string }>;

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
  const { ym, view: viewParam } = await searchParams;

  const trip = await loadTripBasic(tripId);
  if (!trip) notFound();
  if (!(await getTripRole(trip.id, user.id))) notFound();

  const [events, itinerary] = await Promise.all([
    loadCalendarEvents(tripId),
    loadItineraryDays(tripId, trip.startDate),
  ]);

  const tripStart = parseLooseDate(trip.startDate);
  const rangeEnd = tripRangeEnd(trip.endDate, itinerary);
  const view = resolveCalendarView({
    view: typeof viewParam === 'string' ? viewParam : undefined,
    ym: typeof ym === 'string' ? ym : undefined,
    tripStart,
    tripEnd: rangeEnd,
  });
  // Stops are only read for the trip view; the month grid never pays for them.
  const range =
    view === 'trip' && tripStart && rangeEnd
      ? buildTripRange({
          tripStart,
          tripEnd: rangeEnd,
          events,
          itinerary,
          stops: await loadItineraryStops(tripId),
        })
      : null;

  let year: number;
  let month: number;
  const m = typeof ym === 'string' ? /^(\d{4})-(\d{2})$/.exec(ym) : null;
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
  } else if (tripStart) {
    const [y, mm] = tripStart.split('-');
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
      <div className="flex-1">
        <CalendarView
          tripId={tripId}
          year={year}
          month={month}
          tripStart={tripStart}
          tripEnd={rangeEnd}
          events={events}
          itinerary={itinerary}
          todayIso={todayIso}
          locale={localeTag(await getLang())}
          view={view}
          tripRangeAvailable={tripRangeAvailable(tripStart, rangeEnd)}
          range={range}
        />
      </div>
    </>
  );
}
