// Itinerary view for a single trip. Layout above renders Header +
// per-page rail. We render the rail + content side-by-side.

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { formatDistance, type Units } from '@/lib/units';
import { GOOGLE_MAPS_API_KEY } from '@/lib/maps-config';
import { TripRail } from '@/components/trip-rail';
import { TripCover } from '@/components/trip-cover';
import RealMapCanvas from '@/components/real-map-canvas';
import { DaysAccordion } from '@/components/days-accordion';
import { MapPanelToggle } from '@/components/map-panel-toggle';
import { loadTrip, loadBookingCounts, loadHotelsForTrip } from '@/lib/trip-queries';
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
  persistSegmentLegAction,
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
        <section className="relative bg-zinc-50 dark:bg-zinc-950">
          {activeDay && augmentedActive ? (
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
                places: augmentedActive.places,
                segmentModes: augmentedActive.segments.map(
                  (s) => (s?.mode ?? 'drive') as Mode,
                ),
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
      kind: 'hotel' | 'food' | 'sight' | 'transit';
      name: string;
      category?: string | null;
      time?: string | null;
      lat?: number | null;
      lng?: number | null;
      placeIdExternal?: string | null;
    }>;
    segmentModes: Mode[];
  },
  ctx: { tripId: string; activePlaceId: string | null },
) {
  const dayLabel = `Day ${activeDay.idx + 1} · ${activeDay.label} ${activeDay.num}`;
  const apiKey = GOOGLE_MAPS_API_KEY || undefined;
  // Track positional index BEFORE filtering so segmentModes align.
  const indexed = activeDay.places.map((p, i) => ({ p, i }));
  const withCoords = indexed.filter(
    ({ p }) => p.lat != null && p.lng != null,
  );

  if (apiKey && withCoords.length > 0) {
    const segmentModes = withCoords
      .slice(0, -1)
      .map(({ i }) => activeDay.segmentModes[i] ?? 'drive');
    return (
      <RealMapCanvas
        dayLabel={dayLabel}
        totalDistance={activeDay.summaryDistance}
        totalTime={activeDay.summaryTime}
        pins={withCoords.map(({ p }, displayIdx) => ({
          id: p.id,
          idx: displayIdx + 1,
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
  const beginHotels = dayIso
    ? hotels.filter(
        (h) =>
          h.checkInDate &&
          h.checkOutDate &&
          h.checkInDate < dayIso &&
          dayIso <= h.checkOutDate,
      )
    : [];
  const endHotels = dayIso
    ? hotels.filter(
        (h) =>
          h.checkInDate &&
          h.checkOutDate &&
          h.checkInDate <= dayIso &&
          dayIso < h.checkOutDate,
      )
    : [];
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

function isoForDay(start: string, idx: number): string {
  const d = new Date(`${start}T00:00:00`);
  d.setDate(d.getDate() + idx);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hotelToSyntheticPlace(
  h: HotelBooking,
  pos: 'begin' | 'end',
  dayIso: string | null,
) {
  const time =
    pos === 'end' && dayIso === h.checkInDate
      ? h.checkInTime ?? null
      : pos === 'begin' && dayIso === h.checkOutDate
        ? h.checkOutTime ?? null
        : null;
  return {
    id: `hotel-${h.id}-${pos}`,
    idx: -1,
    kind: 'hotel' as const,
    name: h.name,
    address: h.address ?? null,
    lat: h.lat ?? null,
    lng: h.lng ?? null,
    placeIdExternal: h.placeIdExternal ?? null,
    time,
    synthetic: true as const,
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
