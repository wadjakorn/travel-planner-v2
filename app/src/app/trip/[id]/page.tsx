// Itinerary view for a single trip. Layout above renders Header +
// per-page rail. We render the rail + content side-by-side.

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { signInPath } from '@/lib/safe-redirect';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { formatDistance } from '@/lib/units';
import { resolveUnits } from '@/lib/user-settings';
import { TripCover } from '@/components/trip-cover';
import { DaysAccordion } from '@/components/days-accordion';
import { MapPanelToggle } from '@/components/map-panel-toggle';
import { TRIP_ASIDE_CLASS } from '@/components/trip-aside-class';
import { ActivePlaceScroller } from '@/components/active-place-scroller';
import {
  loadTrip,
  loadHotelsForTrip,
  loadTransportForTrip,
} from '@/lib/trip-queries';
import { loadTravelersCount } from '@/lib/trip-travelers';
import {
  dayLegs,
  displayPlacesForDay,
  isoForDay,
  ridesForDay,
} from '@/lib/day-augment';
import type { HotelBooking, Place, Segment } from '@/db/schema';
import {
  addPlaceInlineAction,
  removePlaceAction,
  reorderPlacesAction,
  updatePlaceNoteAction,
  optimizeRouteAction,
} from '@/app/actions/places';
import {
  setSegmentModeAction,
  setHotelLegModeAction,
} from '@/app/actions/segments';
// setDayDefaultModeAction is imported by day-header.tsx directly.

type RouteParams = Promise<{ id: string }>;
type SearchParams = Promise<{ day?: string; placeId?: string }>;

type Mode = 'drive' | 'walk' | 'transit';

export default async function TripPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const session = await auth();
  const user = session?.user;
  const { id } = await params;
  if (!user?.id) redirect(signInPath(`/trip/${encodeURIComponent(id)}`));

  const trip = await loadTrip(id);
  if (!trip) notFound();
  const role = await getTripRole(trip.id, user.id);
  if (!role) notFound();
  const canEdit = canWrite(role);
  const hotels = await loadHotelsForTrip(trip.id);
  const transport = await loadTransportForTrip(trip.id);
  const units = await resolveUnits(user.id);

  const sp = await searchParams;
  const requestedIdx = Number(sp.day);
  const activeIdx =
    Number.isFinite(requestedIdx) &&
    requestedIdx >= 0 &&
    requestedIdx < trip.days.length
      ? requestedIdx
      : 0;
  const activeDay = trip.days[activeIdx];
  const augmentedDays = trip.days.map((d) =>
    augmentDayWithHotels(d, hotels, trip.startDate),
  );
  const augmentedActive = activeDay ? augmentedDays[activeIdx] : null;
  const activePlaceId =
    sp.placeId &&
    augmentedActive?.places.some((p) => p.id === sp.placeId)
      ? sp.placeId
      : null;

  return (
    <>
      <MapPanelToggle />
      {/* Itinerary list column. The map is rendered once by the trip layout
          (persistent-map.tsx) as the next flex sibling, so it survives day +
          sub-page navigation instead of remounting per page. */}
      <aside data-trip-aside className={TRIP_ASIDE_CLASS}>
        <ActivePlaceScroller />
        <TripCover
          title={trip.title}
          subtitle={trip.subtitle}
          dates={`${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`}
          daysCount={trip.days.length}
          travelers={await loadTravelersCount(trip)}
          cover={trip.cover}
        />
        <DaysAccordion
          tripId={trip.id}
          canEdit={canEdit}
          hasDateRange={!!(trip.startDate && trip.endDate)}
          primaryDayId={activeDay?.id ?? null}
          activePlaceId={activePlaceId}
          days={trip.days.map((d, i) => {
            const aug = augmentedDays[i];
            return {
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
              places: aug.places,
              segments: aug.segments,
              rides: ridesForDay(
                transport,
                d.idx,
                trip.startDate ? isoForDay(trip.startDate, d.idx) : null,
              ),
            };
          })}
          reorderPlacesAction={reorderPlacesAction}
          removePlaceAction={removePlaceAction}
          updatePlaceNoteAction={updatePlaceNoteAction}
          addPlaceInlineAction={addPlaceInlineAction}
          setSegmentModeAction={setSegmentModeAction}
          optimizeRouteAction={optimizeRouteAction}
        />
      </aside>
    </>
  );
}

type AugmentedPlace = {
  id: string;
  idx: number;
  kind: 'hotel' | 'food' | 'sight' | 'transit';
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeIdExternal?: string | null;
  time?: string | null;
  synthetic?: boolean;
  editHref?: string;
};

type AugmentedDay = {
  places: AugmentedPlace[];
  segments: AugmentedSeg[];
};

type AugmentedSeg = {
  id: string;
  dayId: string;
  idx: number;
  mode: Mode;
  distance: string;
  time: string;
  synthetic?: boolean;
  setModeAction?: (fd: FormData) => Promise<void>;
} | null;

function augmentDayWithHotels(
  d: {
    id: string;
    idx: number;
    defaultMode: Mode | null;
    places: Place[];
    segments: Segment[];
  },
  hotels: HotelBooking[],
  tripStart: string | null,
): AugmentedDay {
  const places = displayPlacesForDay(d, hotels, tripStart);
  // Leg modes come from the shared dayLegs (by segment.idx), so the list and
  // the map's route agree. Hotel legs become synthetic, hotel-editable rows.
  const segments: AugmentedSeg[] = dayLegs(d, hotels, tripStart).map((l, i) => {
    if (!l) return null;
    if (l.kind === 'segment') return l.segment;
    return {
      id: `seg-syn-${d.id}-${i}`,
      dayId: d.id,
      idx: i,
      mode: l.mode,
      distance: '',
      time: '',
      synthetic: true,
      setModeAction: setHotelLegModeAction.bind(null, l.hotelId, l.leg),
    };
  });
  return { places, segments };
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
