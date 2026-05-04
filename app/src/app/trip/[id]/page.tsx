// Itinerary view for a single trip. Layout above renders Header +
// per-page rail. We render the rail + content side-by-side.

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { formatDistance, type Units } from '@/lib/units';
import { TripRail } from '@/components/trip-rail';
import { PlaceSearchPicker } from '@/components/place-search-picker';
import { TripCover } from '@/components/trip-cover';
import { DayHeader } from '@/components/day-header';
import { OptimizeStrip } from '@/components/optimize-strip';
import MapCanvas from '@/components/map-canvas';
import RealMapCanvas from '@/components/real-map-canvas';
import { SortablePlaceList } from '@/components/sortable-place-list';
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
import Link from 'next/link';

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
              defaultMode: activeDay?.defaultMode ?? null,
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
                setSegmentModeAction={setSegmentModeAction}
                activePlaceId={activePlaceId}
                dayIdx={activeIdx}
              />
              {canEdit ? (
                <PlaceSearchPicker
                  dayId={activeDay.id}
                  tripId={trip.id}
                  addAction={addPlaceInlineAction}
                  variant="inline"
                />
              ) : null}
            </>
          ) : null}
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
        mock: !p.placeIdExternal || p.lat == null || p.lng == null,
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
