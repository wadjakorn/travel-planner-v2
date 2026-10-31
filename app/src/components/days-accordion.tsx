'use client';

import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { DayHeader } from '@/components/day-header';
import { OptimizeStrip } from '@/components/optimize-strip';
import { SortablePlaceList } from '@/components/sortable-place-list';
import { PlaceSearchPicker } from '@/components/place-search-picker';
import { Spinner } from '@/components/spinner';
import { ItineraryRideRow } from '@/components/itinerary-ride-row';
import { useT } from '@/components/i18n-provider';
import { useMapPreview } from '@/components/map-preview-context';
import { DAY_SEARCH_EVENT, type DaySearchDetail } from '@/lib/day-search-focus';
import { sameStop } from '@/lib/full-map-history';
import { activeStopFromUrl } from '@/lib/map-carousel';
import type { DisplayRide } from '@/lib/day-augment';
import type { DayHours } from '@/lib/opening-hours';

type Place = {
  id: string;
  idx: number;
  kind: 'hotel' | 'food' | 'sight' | 'transit';
  name: string;
  category?: string | null;
  rating?: number | null;
  reviews?: number | null;
  time?: string | null;
  duration?: string | null;
  price?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  hours?: string | null;
  dayHours?: DayHours | null;
  tags?: string[] | null;
  thumb?: string | null;
  note?: string | null;
  bookingRef?: string | null;
  bookingRoom?: string | null;
  bookingTotal?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeIdExternal?: string | null;
  synthetic?: boolean;
  editHref?: string;
};

type SegmentData = {
  id: string;
  mode: 'drive' | 'walk' | 'transit';
  distance: string;
  time: string;
  idx: number;
  synthetic?: boolean;
  setModeAction?: (formData: FormData) => Promise<void>;
};

export type AccordionDay = {
  id: string;
  idx: number;
  label: string;
  num: number;
  date: string;
  title: string;
  summaryDistanceFormatted: string | null;
  summaryTime: string | null;
  optimizeSavingsTime: string | null;
  optimizeSavingsSwap: string | null;
  defaultMode: 'drive' | 'walk' | 'transit' | null;
  places: Place[];
  segments: (SegmentData | null)[];
  rides: DisplayRide[];
};

type Action = (fd: FormData) => Promise<void>;

type Props = {
  tripId: string;
  canEdit: boolean;
  hasDateRange: boolean;
  days: AccordionDay[];
  reorderPlacesAction: Action;
  removePlaceAction: Action;
  updatePlaceNoteAction: Action;
  addPlaceInlineAction: Action;
  setSegmentModeAction: Action;
  optimizeRouteAction: Action;
};

/** Puts the row (or, for a stop with no row, the day) at the top of the list column. */
function scrollToStop(dayId: string, placeId: string | null) {
  const aside = document.querySelector<HTMLElement>('[data-trip-aside]');
  // Inside the day: hotel rows share ids across days.
  const day = aside?.querySelector(`[data-day-id="${CSS.escape(dayId)}"]`);
  if (!aside || !day) return;
  const target = (placeId && day.querySelector(`[data-place-id="${CSS.escape(placeId)}"]`)) || day;
  const before = aside.scrollTop;
  // The nav's hide-on-scroll must not take this for the user scrolling down.
  aside.dataset.silentScroll = '1';
  aside.scrollTop = before + target.getBoundingClientRect().top - aside.getBoundingClientRect().top;
  // No move, no scroll event to clear the flag.
  if (aside.scrollTop === before) delete aside.dataset.silentScroll;
}

export function DaysAccordion({
  tripId,
  canEdit,
  hasDateRange,
  days,
  reorderPlacesAction,
  removePlaceAction,
  updatePlaceNoteAction,
  addPlaceInlineAction,
  setSegmentModeAction,
  optimizeRouteAction,
}: Props) {
  const t = useT();
  const searchParams = useSearchParams();
  const { dayId: primaryDayId, placeId: activePlaceId } = activeStopFromUrl(searchParams, days);
  const { returnTo, clearReturnTo } = useMapPreview();
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(primaryDayId ? [primaryDayId] : []),
  );

  // Open the newly-primary day. React's documented way to adjust state when a
  // prop changes is during render, not in an effect: an effect would paint the
  // day closed first and then re-render it open.
  // Same for a newly active place (map pin or row click): if the user had
  // collapsed its day, reopen it so ActivePlaceScroller can reach the row.
  const [lastPrimaryDayId, setLastPrimaryDayId] = useState(primaryDayId);
  const [lastActivePlaceId, setLastActivePlaceId] = useState(activePlaceId);
  if (primaryDayId !== lastPrimaryDayId || activePlaceId !== lastActivePlaceId) {
    const reopen = primaryDayId !== lastPrimaryDayId || activePlaceId != null;
    setLastPrimaryDayId(primaryDayId);
    setLastActivePlaceId(activePlaceId);
    if (reopen && primaryDayId && !openIds.has(primaryDayId)) {
      setOpenIds(new Set(openIds).add(primaryDayId));
    }
  }

  // Back from the map on a new stop. Waits until the URL is the map's (Back
  // restores the older one first); a frame later the aside is showing again and
  // the day below is open.
  const returning = returnTo != null && sameStop(returnTo, `?${searchParams}`);
  if (returning && primaryDayId && !openIds.has(primaryDayId)) {
    setOpenIds(new Set(openIds).add(primaryDayId));
  }
  useEffect(() => {
    if (!returning || !primaryDayId) return;
    const raf = requestAnimationFrame(() => {
      scrollToStop(primaryDayId, activePlaceId);
      clearReturnTo();
    });
    return () => cancelAnimationFrame(raf);
  }, [returning, primaryDayId, activePlaceId, clearReturnTo]);

  // Map "Search places" / `/`: open the day; its picker takes the focus on mount.
  useEffect(() => {
    const onSearch = (e: Event) => {
      const { dayId } = (e as CustomEvent<DaySearchDetail>).detail;
      setOpenIds((prev) => (prev.has(dayId) ? prev : new Set(prev).add(dayId)));
    };
    window.addEventListener(DAY_SEARCH_EVENT, onSearch);
    return () => window.removeEventListener(DAY_SEARCH_EVENT, onSearch);
  }, []);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busyDayId, setBusyDayId] = useState<string | null>(null);
  const [, startToggleTransition] = useTransition();
  function toggle(id: string) {
    setPendingId(id);
    startToggleTransition(() => {
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setPendingId(null);
    });
  }

  return (
    <div>
      {days.map((day) => {
        const isOpen = openIds.has(day.id);
        if (!isOpen) {
          return (
            <div key={day.id} className="px-5 py-1.5">
              <button
                type="button"
                onClick={() => toggle(day.id)}
                className="block w-full cursor-pointer rounded-lg border border-border bg-surface-2 px-4 py-3 text-left text-[14px] font-semibold text-foreground"
                aria-label={t('itin_day_expand_aria', { title: day.title })}
                aria-expanded={false}
                aria-busy={pendingId === day.id || undefined}
              >
                {day.title}
                <span className="ml-2 text-[12px] font-medium text-muted">
                  {day.date}
                </span>
                {pendingId === day.id ? (
                  <span className="ml-2 inline-block align-middle">
                    <Spinner size={12} color="var(--brand)" trackColor="color-mix(in srgb, var(--brand) 20%, transparent)" />
                  </span>
                ) : null}
              </button>
            </div>
          );
        }

        return (
          <div
            key={day.id}
            className="border-t border-border"
            data-day-id={day.id}
            data-day-idx={day.idx}
          >
            {/* Sits right under the trip cover: the visible label says it
                collapses the day, not the cover (review I7). */}
            <button
              type="button"
              onClick={() => toggle(day.id)}
              aria-expanded={true}
              aria-busy={pendingId === day.id || undefined}
              className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 border-b border-border bg-surface-2 text-[12px] font-medium text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {pendingId === day.id ? (
                <Spinner size={14} color="var(--brand)" trackColor="color-mix(in srgb, var(--brand) 20%, transparent)" />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              )}
              {t('itin_day_collapse', { n: day.idx + 1 })}
            </button>
            <DayHeader
              days={days.map((d) => ({ id: d.id, idx: d.idx, label: d.label, num: d.num }))}
              activeIdx={day.idx}
              activeDayId={day.id}
              activeDay={{
                title: day.title,
                dateLabel: day.date,
                summaryDistance: day.summaryDistanceFormatted,
                summaryTime: day.summaryTime,
                defaultMode: day.defaultMode,
              }}
              tripId={tripId}
              canEdit={canEdit}
              hasDateRange={hasDateRange}
              hideChips
              onModeBusyChange={(b) => {
                if (b) setBusyDayId(day.id);
                else setBusyDayId((cur) => (cur === day.id ? null : cur));
              }}
            />

            {day.rides.length > 0 ? (
              <div>
                {day.rides.map((ride) => (
                  <ItineraryRideRow key={ride.id} ride={ride} tripId={tripId} />
                ))}
              </div>
            ) : null}

            {canEdit && day.optimizeSavingsTime ? (
              <form action={optimizeRouteAction}>
                <input type="hidden" name="dayId" value={day.id} />
                <OptimizeStrip
                  savings={{
                    time: day.optimizeSavingsTime,
                    swap: day.optimizeSavingsSwap ?? '',
                  }}
                />
              </form>
            ) : null}

            <div className="relative">
              <SortablePlaceList
                tripId={tripId}
                dayId={day.id}
                places={day.places}
                segments={day.segments}
                reorderAction={reorderPlacesAction}
                editHrefBase={`/trip/${tripId}/place`}
                removeAction={removePlaceAction}
                updateNoteAction={updatePlaceNoteAction}
                canEdit={canEdit}
                setSegmentModeAction={setSegmentModeAction}
                // Only the URL's day: synthetic hotel rows share ids across days
                // (lib/day-augment.ts), so the same id would mark (and aria-current)
                // a row in every open day.
                activePlaceId={day.id === primaryDayId ? activePlaceId : null}
                dayIdx={day.idx}
                onMoveBusyChange={(b) => {
                  if (b) setBusyDayId(day.id);
                  else setBusyDayId((cur) => (cur === day.id ? null : cur));
                }}
              />
              {busyDayId === day.id ? (
                <div
                  className="absolute inset-0 z-20 flex items-center justify-center bg-surface/60 backdrop-blur-[1px]"
                  aria-label={t('itin_loading_places_aria')}
                  aria-busy
                >
                  <Spinner size={24} color="var(--brand)" trackColor="color-mix(in srgb, var(--brand) 20%, transparent)" />
                </div>
              ) : null}
            </div>

            {canEdit ? (
              <PlaceSearchPicker
                dayId={day.id}
                tripId={tripId}
                addAction={addPlaceInlineAction}
                variant="inline"
                dayLabel={t('itin_day_n', { n: day.idx + 1 })}
                onBusyChange={(b) => {
                  if (b) setBusyDayId(day.id);
                  else setBusyDayId((cur) => (cur === day.id ? null : cur));
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
