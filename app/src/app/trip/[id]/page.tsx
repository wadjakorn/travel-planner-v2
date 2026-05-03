// Itinerary view for a single trip. Slice 2E wires drag/reorder
// (places only — day reorder defers to Phase 11 polish), the
// "Saved Xm ago" header indicator, and the optimize-route stub.

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
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
  // Owner-only access for now. Phase 8 layers in trip_membership.
  if (trip.ownerId !== user.id) notFound();

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
              summaryDistance: activeDay?.summaryDistance ?? null,
              summaryTime: activeDay?.summaryTime ?? null,
            }}
            tripId={trip.id}
          />
          {activeDay ? (
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
            <SortablePlaceList
              tripId={trip.id}
              dayId={activeDay.id}
              places={activeDay.places}
              segments={activeDay.segments}
              reorderAction={reorderPlacesAction}
              editHrefBase={`/trip/${trip.id}/place`}
              removeAction={removePlaceAction}
            />
          ) : null}
        </aside>
        <section className="relative bg-zinc-50 dark:bg-zinc-950">
          {activeDay ? (
            renderMap(activeDay)
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
