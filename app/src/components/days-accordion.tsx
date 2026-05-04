'use client';

import { useEffect, useState, useTransition } from 'react';
import { DayHeader } from '@/components/day-header';
import { OptimizeStrip } from '@/components/optimize-strip';
import { SortablePlaceList } from '@/components/sortable-place-list';
import { PlaceSearchPicker } from '@/components/place-search-picker';
import { Spinner } from '@/components/spinner';

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
  tags?: string[] | null;
  thumb?: string | null;
  note?: string | null;
  bookingRef?: string | null;
  bookingRoom?: string | null;
  bookingTotal?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeIdExternal?: string | null;
};

type SegmentData = {
  id: string;
  mode: 'drive' | 'walk' | 'transit';
  distance: string;
  time: string;
  idx: number;
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
  segments: SegmentData[];
};

type Action = (fd: FormData) => Promise<void>;

type Props = {
  tripId: string;
  canEdit: boolean;
  hasDateRange: boolean;
  primaryDayId: string | null;
  primaryDayIdx: number;
  activePlaceId: string | null;
  days: AccordionDay[];
  reorderPlacesAction: Action;
  removePlaceAction: Action;
  addPlaceInlineAction: Action;
  setSegmentModeAction: Action;
  optimizeRouteAction: Action;
};

export function DaysAccordion({
  tripId,
  canEdit,
  hasDateRange,
  primaryDayId,
  primaryDayIdx,
  activePlaceId,
  days,
  reorderPlacesAction,
  removePlaceAction,
  addPlaceInlineAction,
  setSegmentModeAction,
  optimizeRouteAction,
}: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(primaryDayId ? [primaryDayId] : []),
  );

  useEffect(() => {
    if (!primaryDayId) return;
    setOpenIds((prev) => {
      if (prev.has(primaryDayId)) return prev;
      const next = new Set(prev);
      next.add(primaryDayId);
      return next;
    });
  }, [primaryDayId]);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [addingDayId, setAddingDayId] = useState<string | null>(null);
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
            <button
              type="button"
              onClick={() => toggle(day.id)}
              aria-label={`Collapse ${day.title}`}
              title="Collapse"
              style={{
                width: '100%',
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fafafc',
                border: 'none',
                borderBottom: '1px solid #f2f2f7',
                color: '#86868b',
                cursor: 'pointer',
                transition: 'background 150ms, color 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f2f2f7';
                e.currentTarget.style.color = '#1d1d1f';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fafafc';
                e.currentTarget.style.color = '#86868b';
              }}
            >
              {pendingId === day.id ? (
                <Spinner size={14} color="#0071e3" trackColor="rgba(0,113,227,0.2)" />
              ) : (
                <svg
                  width="18"
                  height="18"
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
            />

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
                canEdit={canEdit}
                setSegmentModeAction={setSegmentModeAction}
                activePlaceId={day.id === primaryDayId ? activePlaceId : null}
                dayIdx={day.idx}
              />
              {addingDayId === day.id ? (
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
                onBusyChange={(b) => {
                  if (b) setAddingDayId(day.id);
                  else setAddingDayId((cur) => (cur === day.id ? null : cur));
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
