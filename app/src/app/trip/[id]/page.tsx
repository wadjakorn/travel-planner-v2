// Itinerary view for a single trip. Layout above renders Header +
// per-page rail. We render the rail + content side-by-side.

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { formatDistance, type Units } from '@/lib/units';
import { TripRail } from '@/components/trip-rail';
import { TripCover } from '@/components/trip-cover';
import RealMapCanvas from '@/components/real-map-canvas';
import { DaysAccordion } from '@/components/days-accordion';
import { loadTrip, loadBookingCounts } from '@/lib/trip-queries';
import {
  addPlaceInlineAction,
  removePlaceAction,
  reorderPlacesAction,
  optimizeRouteAction,
} from '@/app/actions/places';
import {
  setSegmentModeAction,
  persistSegmentLegAction,
} from '@/app/actions/segments';
// setDayDefaultModeAction is imported by day-header.tsx directly.

type RouteParams = Promise<{ id: string }>;
type SearchParams = Promise<{ day?: string; placeId?: string }>;

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
  const counts = await loadBookingCounts(trip.id);
  const units = ((await cookies()).get('units')?.value === 'imperial'
    ? 'imperial'
    : 'metric') as Units;

  const sp = await searchParams;
  const requestedIdx = Number(sp.day);
  const activeIdx =
    Number.isFinite(requestedIdx) &&
    requestedIdx >= 0 &&
    requestedIdx < trip.days.length
      ? requestedIdx
      : 0;
  const activeDay = trip.days[activeIdx];
  const activePlaceId = sp.placeId && activeDay?.places.some((p) => p.id === sp.placeId)
    ? sp.placeId
    : null;

  return (
    <>
      <TripRail tripId={trip.id} active="itinerary" counts={counts} />
      <div className="grid min-h-[calc(100vh-57px)] flex-1 grid-cols-1 lg:grid-cols-[minmax(380px,460px)_1fr]">
        <aside className="overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
          <TripCover
            title={trip.title}
            subtitle={trip.subtitle}
            dates={`${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`}
            daysCount={trip.days.length}
            travelers={(trip.collaborators?.length ?? 0) + 1}
            cover={trip.cover}
          />
          <DaysAccordion
            tripId={trip.id}
            canEdit={canEdit}
            hasDateRange={!!(trip.startDate && trip.endDate)}
            primaryDayId={activeDay?.id ?? null}
            primaryDayIdx={activeIdx}
            activePlaceId={activePlaceId}
            days={trip.days.map((d) => ({
              id: d.id,
              idx: d.idx,
              label: d.label,
              num: d.num,
              date: d.date,
              title: d.title,
              summaryDistanceFormatted: formatDistance(
                d.summaryDistance ?? null,
                units,
              ),
              summaryTime: d.summaryTime ?? null,
              optimizeSavingsTime: d.optimizeSavingsTime ?? null,
              optimizeSavingsSwap: d.optimizeSavingsSwap ?? null,
              defaultMode: d.defaultMode ?? null,
              places: d.places,
              segments: d.segments,
            }))}
            reorderPlacesAction={reorderPlacesAction}
            removePlaceAction={removePlaceAction}
            addPlaceInlineAction={addPlaceInlineAction}
            setSegmentModeAction={setSegmentModeAction}
            optimizeRouteAction={optimizeRouteAction}
          />
        </aside>
        <section className="relative bg-zinc-50 dark:bg-zinc-950">
          {activeDay ? (
            renderMap(
              {
                id: activeDay.id,
                idx: activeDay.idx,
                label: activeDay.label,
                num: activeDay.num,
                summaryDistance: formatDistance(
                  activeDay.summaryDistance,
                  units,
                ),
                summaryTime: activeDay.summaryTime,
                places: activeDay.places,
                segments: activeDay.segments,
              },
              { tripId: trip.id, activePlaceId },
            )
          ) : null}
        </section>
      </div>
    </>
  );
}

function renderMap(
  activeDay: {
    id: string;
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
      category?: string | null;
      time?: string | null;
      lat: number | null;
      lng: number | null;
      placeIdExternal: string | null;
      x: number | null;
      y: number | null;
    }>;
    segments: Array<{ idx: number; mode: 'drive' | 'walk' | 'transit' }>;
  },
  ctx: { tripId: string; activePlaceId: string | null },
) {
  const dayLabel = `Day ${activeDay.idx + 1} · ${activeDay.label} ${activeDay.num}`;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const placesWithCoords = activeDay.places.filter(
    (p) => p.lat !== null && p.lng !== null,
  );

  if (apiKey && placesWithCoords.length > 0) {
    const segByIdx = new Map(activeDay.segments.map((s) => [s.idx, s.mode]));
    const segmentModes = placesWithCoords
      .slice(0, -1)
      .map((p) => segByIdx.get(p.idx) ?? 'drive');
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
          category: p.category ?? null,
          time: p.time ?? null,
        }))}
        segmentModes={segmentModes}
        dayId={activeDay.id}
        setSegmentModeAction={setSegmentModeAction}
        persistSegmentLegAction={persistSegmentLegAction}
        activePlaceId={ctx.activePlaceId}
        tripId={ctx.tripId}
        dayIdx={activeDay.idx}
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Add a spot to see it on the map.
      </p>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
