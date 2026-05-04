// Itinerary view for a single trip. Slice 2E wires drag/reorder
// (places only — day reorder defers to Phase 11 polish), the
// "Saved Xm ago" header indicator, and the optimize-route stub.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tripMemberships, users } from '@/db/schema';
import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { formatDistance, type Units } from '@/lib/units';
import { Plus } from '@/components/icons';
import { Header } from '@/components/header';
import { TripNav } from '@/components/trip-nav';
import { TripCover } from '@/components/trip-cover';
import { DayHeader } from '@/components/day-header';
import { OptimizeStrip } from '@/components/optimize-strip';
import MapCanvas from '@/components/map-canvas';
import RealMapCanvas from '@/components/real-map-canvas';
import { SortablePlaceList } from '@/components/sortable-place-list';
import { loadTrip } from '@/lib/trip-queries';
import {
  removePlaceAction,
  reorderPlacesAction,
  optimizeRouteAction,
} from '@/app/actions/places';

type RouteParams = Promise<{ id: string }>;
type SearchParams = Promise<{ day?: string }>;

export default async function TripPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id } = await params;
  const trip = await loadTrip(id);
  if (!trip) notFound();
  const role = await getTripRole(trip.id, user.id);
  if (!role) notFound();
  const canEdit = canWrite(role);
  const units = ((await cookies()).get('units')?.value === 'imperial'
    ? 'imperial'
    : 'metric') as Units;

  const memberRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(tripMemberships)
    .innerJoin(users, eq(users.id, tripMemberships.userId))
    .where(eq(tripMemberships.tripId, trip.id));

  const sp = await searchParams;
  const requestedIdx = Number(sp.day);
  const activeIdx =
    Number.isFinite(requestedIdx) &&
    requestedIdx >= 0 &&
    requestedIdx < trip.days.length
      ? requestedIdx
      : 0;
  const activeDay = trip.days[activeIdx];

  return (
    <>
      <Header
        user={user}
        tripTitle={trip.title}
        tripUpdatedAt={trip.updatedAt.toISOString()}
        collaborators={memberRows}
      />
      <TripNav tripId={trip.id} active="itinerary" />
      <div className="grid min-h-[calc(100vh-104px)] grid-cols-1 lg:grid-cols-[minmax(360px,440px)_1fr]">
        <aside className="overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
          <TripCover
            title={trip.title}
            subtitle={trip.subtitle}
            dates={`${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`}
            daysCount={trip.days.length}
            travelers={(trip.collaborators?.length ?? 0) + 1}
            cover={trip.cover}
          />
          <DayHeader
            days={trip.days.map((d) => ({
              id: d.id,
              idx: d.idx,
              label: d.label,
              num: d.num,
            }))}
            activeIdx={activeIdx}
            activeDayId={activeDay?.id}
            activeDay={{
              title: activeDay?.title ?? '',
              summaryDistance: formatDistance(
                activeDay?.summaryDistance ?? null,
                units,
              ),
              summaryTime: activeDay?.summaryTime ?? null,
            }}
            tripId={trip.id}
            canEdit={canEdit}
          />
          {activeDay && canEdit ? (
            <OptimizeStripForm
              dayId={activeDay.id}
              savings={
                activeDay.optimizeSavingsTime
                  ? {
                      time: activeDay.optimizeSavingsTime,
                      swap: activeDay.optimizeSavingsSwap ?? '',
                    }
                  : null
              }
            />
          ) : null}
          {activeDay ? (
            <>
              <SortablePlaceList
                tripId={trip.id}
                dayId={activeDay.id}
                places={activeDay.places}
                segments={activeDay.segments}
                reorderAction={reorderPlacesAction}
                editHrefBase={`/trip/${trip.id}/place`}
                removeAction={removePlaceAction}
                canEdit={canEdit}
              />
              {canEdit ? (
                <div className="px-4 py-3">
                  <Link
                    href={`/trip/${trip.id}/day/${activeDay.id}/place/new`}
                    className="inline-flex items-center gap-2 rounded-full border border-dashed border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
                  >
                    <Plus width={14} height={14} />
                    Add place
                  </Link>
                </div>
              ) : null}
            </>
          ) : null}
        </aside>
        <section className="relative bg-zinc-50 dark:bg-zinc-950">
          {activeDay ? (
            renderMap({
              ...activeDay,
              summaryDistance: formatDistance(
                activeDay.summaryDistance,
                units,
              ),
            })
          ) : null}
        </section>
      </div>
    </>
  );
}

function renderMap(activeDay: {
  idx: number;
  label: string;
  num: number;
  summaryDistance: string | null;
  summaryTime: string | null;
  places: Array<{
    id: string;
    idx: number;
    kind: 'hotel' | 'food' | 'sight' | 'transit';
    name: string;
    lat: number | null;
    lng: number | null;
    x: number | null;
    y: number | null;
  }>;
}) {
  const dayLabel = `Day ${activeDay.idx + 1} · ${activeDay.label} ${activeDay.num}`;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const placesWithCoords = activeDay.places.filter(
    (p) => p.lat !== null && p.lng !== null,
  );

  if (apiKey && placesWithCoords.length > 0) {
    return (
      <RealMapCanvas
        dayLabel={dayLabel}
        totalDistance={activeDay.summaryDistance}
        totalTime={activeDay.summaryTime}
        pins={placesWithCoords.map((p) => ({
          id: p.id,
          idx: p.idx + 1,
          kind: p.kind,
          lat: p.lat as number,
          lng: p.lng as number,
          name: p.name,
        }))}
      />
    );
  }

  // Fallback to mockup SVG (no API key, or no real coords yet).
  return (
    <MapCanvas
      dayLabel={dayLabel}
      totalDistance={activeDay.summaryDistance}
      totalTime={activeDay.summaryTime}
      pins={activeDay.places.map((p) => ({
        id: p.id,
        idx: p.idx + 1,
        kind: p.kind,
        x: p.x ?? 500,
        y: p.y ?? 350,
        name: p.name,
      }))}
    />
  );
}

function OptimizeStripForm({
  dayId,
  savings,
}: {
  dayId: string;
  savings: { time: string; swap: string } | null;
}) {
  if (!savings) return null;
  return (
    <form action={optimizeRouteAction}>
      <input type="hidden" name="dayId" value={dayId} />
      <OptimizeStrip savings={savings} />
    </form>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
