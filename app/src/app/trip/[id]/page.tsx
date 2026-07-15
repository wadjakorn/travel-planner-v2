// Itinerary view for a single trip. Layout above renders Header +
// per-page rail. We render the rail + content side-by-side.

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { formatDistance, type Units } from '@/lib/units';
import { TripRail } from '@/components/trip-rail';
import { TripCover } from '@/components/trip-cover';
import { DaysAccordion } from '@/components/days-accordion';
import { MapPanelToggle } from '@/components/map-panel-toggle';
import {
  loadTrip,
  loadBookingCounts,
  loadHotelsForTrip,
  loadTransportForTrip,
} from '@/lib/trip-queries';
import {
  isoForDay,
  splitHotelsForDay,
  hotelToSyntheticPlace,
  ridesForDay,
} from '@/lib/day-augment';
import type { HotelBooking } from '@/db/schema';
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
  if (!user?.id) redirect('/sign-in');

  const { id } = await params;
  const trip = await loadTrip(id);
  if (!trip) notFound();
  const role = await getTripRole(trip.id, user.id);
  if (!role) notFound();
  const canEdit = canWrite(role);
  const counts = await loadBookingCounts(trip.id);
  const hotels = await loadHotelsForTrip(trip.id);
  const transport = await loadTransportForTrip(trip.id);
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
      <TripRail tripId={trip.id} active="itinerary" counts={counts} />
      <MapPanelToggle />
      {/* Itinerary list column. The map is rendered once by the trip layout
          (persistent-map.tsx) as the next flex sibling, so it survives day +
          sub-page navigation instead of remounting per page. */}
      <aside
        data-trip-aside
        className="h-[calc(100dvh-57px-56px)] min-h-0 flex-1 overflow-y-auto border-r border-zinc-200 pb-24 dark:border-zinc-800 md:h-auto md:min-h-[calc(100vh-57px)] md:w-[400px] md:flex-none md:pb-0 lg:w-[440px]"
      >
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
    places: Array<{
      id: string;
      idx: number;
      kind: 'hotel' | 'food' | 'sight' | 'transit';
      name: string;
      address?: string | null;
      lat?: number | null;
      lng?: number | null;
      placeIdExternal?: string | null;
      time?: string | null;
    }>;
    segments: Array<{
      id: string;
      dayId: string;
      idx: number;
      mode: Mode;
      distance: string;
      time: string;
    }>;
  },
  hotels: HotelBooking[],
  tripStart: string | null,
): AugmentedDay {
  const dayIso = tripStart ? isoForDay(tripStart, d.idx) : null;
  const { beginHotels, endHotels } = splitHotelsForDay(hotels, dayIso);
  const synBegin = beginHotels.map((h) =>
    hotelToSyntheticPlace(h, 'begin', dayIso),
  );
  const synEnd = endHotels.map((h) =>
    hotelToSyntheticPlace(h, 'end', dayIso),
  );
  const places = [...synBegin, ...d.places, ...synEnd];
  const padBegin = synBegin.length;
  const r = d.places.length;
  const b = beginHotels.length;
  const segCount = Math.max(0, places.length - 1);
  const baseMode = (d.defaultMode ?? 'drive') as Mode;
  const segments: AugmentedSeg[] = [];
  for (let i = 0; i < segCount; i++) {
    if (i < b) {
      const h = beginHotels[i];
      segments.push({
        id: `seg-syn-${d.id}-${i}`,
        dayId: d.id,
        idx: i,
        mode: (h.departureMode ?? baseMode) as Mode,
        distance: '',
        time: '',
        synthetic: true,
        setModeAction: setHotelLegModeAction.bind(null, h.id, 'departure'),
      });
    } else if (i + 1 >= b + r) {
      const endIdx = i + 1 - (b + r);
      const h = endHotels[endIdx];
      segments.push({
        id: `seg-syn-${d.id}-${i}`,
        dayId: d.id,
        idx: i,
        mode: (h.arrivalMode ?? baseMode) as Mode,
        distance: '',
        time: '',
        synthetic: true,
        setModeAction: setHotelLegModeAction.bind(null, h.id, 'arrival'),
      });
    } else {
      segments.push(d.segments[i - padBegin] ?? null);
    }
  }
  return { places, segments } as AugmentedDay;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
