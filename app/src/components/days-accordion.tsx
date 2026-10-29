'use client';

import { useState, useTransition } from 'react';
import { DayHeader } from '@/components/day-header';
import { OptimizeStrip } from '@/components/optimize-strip';
import { SortablePlaceList } from '@/components/sortable-place-list';
import { PlaceSearchPicker } from '@/components/place-search-picker';
import { Spinner } from '@/components/spinner';
import { ItineraryRideRow } from '@/components/itinerary-ride-row';
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
  primaryDayId: string | null;
  activePlaceId: string | null;
  days: AccordionDay[];
  reorderPlacesAction: Action;
  removePlaceAction: Action;
  updatePlaceNoteAction: Action;
  addPlaceInlineAction: Action;
  setSegmentModeAction: Action;
  optimizeRouteAction: Action;
};

export function DaysAccordion({
  tripId,
  canEdit,
  hasDateRange,
  primaryDayId,
  activePlaceId,
  days,
  reorderPlacesAction,
  removePlaceAction,
  updatePlaceNoteAction,
  addPlaceInlineAction,
  setSegmentModeAction,
  optimizeRouteAction,
}: Props) {
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
            <div key={day.id} style={{ padding: '6px 20px' }}>
              <button
                type="button"
                onClick={() => toggle(day.id)}
                style={{
                  display: 'block',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid #e5e5ea',
                  background: '#f5f5f7',
                  color: '#1d1d1f',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                }}
                aria-label={`Expand ${day.title}`}
                aria-expanded={false}
                aria-busy={pendingId === day.id || undefined}
              >
                {day.title}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#86868b',
                    marginLeft: 8,
                  }}
                >
                  {day.date}
                </span>
                {pendingId === day.id ? (
                  <span style={{ marginLeft: 8, verticalAlign: 'middle', display: 'inline-block' }}>
                    <Spinner size={12} color="#0071e3" trackColor="rgba(0,113,227,0.2)" />
                  </span>
                ) : null}
              </button>
            </div>
          );
        }

        return (
          <div
            key={day.id}
            style={{ borderTop: '1px solid #f2f2f7' }}
            data-day-id={day.id}
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
                <Spinner size={14} color="#0071e3" trackColor="rgba(0,113,227,0.2)" />
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
              Collapse Day {day.idx + 1}
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

            <div style={{ position: 'relative' }}>
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
                activePlaceId={activePlaceId}
                dayIdx={day.idx}
                onMoveBusyChange={(b) => {
                  if (b) setBusyDayId(day.id);
                  else setBusyDayId((cur) => (cur === day.id ? null : cur));
                }}
              />
              {busyDayId === day.id ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(255,255,255,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 20,
                    backdropFilter: 'blur(1px)',
                  }}
                  aria-label="Loading places"
                  aria-busy
                >
                  <Spinner size={24} color="#0071e3" trackColor="rgba(0,113,227,0.2)" />
                </div>
              ) : null}
            </div>

            {canEdit ? (
              <PlaceSearchPicker
                dayId={day.id}
                tripId={tripId}
                addAction={addPlaceInlineAction}
                variant="inline"
                dayLabel={`Day ${day.idx + 1}`}
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
