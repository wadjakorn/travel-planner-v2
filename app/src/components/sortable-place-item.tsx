'use client';

// SortablePlaceItem — the per-row draggable component used by SortablePlaceList.
// Exported as two named variants:
//   SortableItem  — live dnd-kit draggable row (mounted client-side)
//   StaticItem    — SSR-safe fallback rendered before dnd-kit hydrates

import { useEffect } from 'react';
import type { FocusEvent, PointerEvent } from 'react';
import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { PlaceRow } from '@/components/place-row';
import { PlaceNoteLauncher } from '@/components/place-note-launcher';
import { Segment } from '@/components/segment';
import { placeProvider } from '@/lib/places/place-id';
import { clearPlaceHover, setPlaceHover } from '@/lib/maps/hover-store';
import { useIsPlaceHovered } from '@/components/use-place-hover';
import type { DayHours } from '@/lib/opening-hours';
import { Edit, Trash, Drag } from '@/components/icons';
import { Spinner } from '@/components/spinner';
import { SubmitButton } from '@/components/submit-button';
import { useT } from '@/components/i18n-provider';
import styles from './sortable-place-list.module.css';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type Place = {
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

export type SegmentData = {
  id: string;
  idx?: number;
  mode: 'drive' | 'walk' | 'transit';
  distance: string;
  time: string;
  synthetic?: boolean;
  setModeAction?: (formData: FormData) => Promise<void>;
};

export type ItemProps = {
  place: Place;
  displayIdx: number;          // 1-based position in the current local order
  segment: SegmentData | null; // segment that follows this place (null for last)
  nextPlace: Place | null;
  editHrefBase: string;
  removeAction: (formData: FormData) => Promise<void>;
  updateNoteAction: (formData: FormData) => Promise<void>;
  canEdit?: boolean;
  dayId?: string;
  segmentIdx?: number;
  setSegmentModeAction?: (formData: FormData) => Promise<void>;
  active?: boolean;
  onActivate?: (id: string) => void;
  busy?: boolean;
};

// ---------------------------------------------------------------------------
// List → map hover link (lib/maps/hover-store): a mouse hover or keyboard focus
// anywhere in the row (row actions included) lifts its pin. Touch never
// publishes (it fires an enter with no leave), and a click's focus does not
// match :focus-visible, so neither leaves a sticky lift.
// ---------------------------------------------------------------------------

function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false; // browsers without :focus-visible
  }
}

function rowHoverHandlers(dayId: string | undefined, placeId: string) {
  if (!dayId) return {};
  const set = () => setPlaceHover({ dayId, placeId, source: 'list' });
  const clear = () => clearPlaceHover('list', placeId);
  return {
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') set();
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType === 'mouse') clear();
    },
    // Focus events bubble in React: check the element that took focus.
    onFocus: (e: FocusEvent) => {
      if (isFocusVisible(e.target)) set();
    },
    onBlur: clear,
  };
}

// ---------------------------------------------------------------------------
// SortableItem — one draggable place slot
// ---------------------------------------------------------------------------

export function SortableItem({
  place,
  displayIdx,
  segment,
  nextPlace,
  editHrefBase,
  removeAction,
  updateNoteAction,
  canEdit = true,
  dayId,
  segmentIdx,
  setSegmentModeAction,
  active = false,
  onActivate,
  busy = false,
}: ItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: place.id });
  const t = useT();
  const hovered = useIsPlaceHovered(dayId, place.id, 'map');

  // A dragged row must not leave its pin lifted during or after the reorder.
  useEffect(() => {
    if (isDragging) clearPlaceHover('list', place.id);
  }, [isDragging, place.id]);
  useEffect(() => () => clearPlaceHover('list', place.id), [place.id]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={styles.row}
    >
      {/* Inner wrapper — relative for the hover affordances. The hover link
          sits here, not on the role=button div: the row actions are its
          siblings, and reaching them must not drop the pin's lift. */}
      <div className="group relative flex items-start" {...rowHoverHandlers(dayId, place.id)}>
        {/* Drag handle — listeners + attributes go here only */}
        {canEdit && !place.synthetic ? (
          <button
            type="button"
            aria-label={t('place_reorder_aria', { name: place.name })}
            className={styles.handle}
            {...attributes}
            {...listeners}
          >
            <Drag width={14} height={14} />
          </button>
        ) : (
          <span className={styles.handle} aria-hidden />
        )}

        {/* Place row fills the rest. Click anywhere except a nested
            link/button toggles active state. */}
        {/* onPointerUp instead of onClick: iOS hover-emulation eats the
            first tap on rows that follow a previously-tapped row, requiring
            a double-tap to activate spots in a different day. Pointer events
            fire on touch release immediately. */}
        <div
          className="min-w-0 flex-1 cursor-pointer"
          role="button"
          tabIndex={0}
          aria-current={active ? 'true' : undefined}
          onPointerUp={(e) => {
            // Mouse: only primary button. Touch/pen: button is 0 by default.
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const el = e.target as HTMLElement;
            if (el.closest('a, button, select, input, label, summary')) return;
            onActivate?.(place.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              const el = e.target as HTMLElement;
              if (el.closest('a, button, select, input, label, summary')) return;
              e.preventDefault();
              onActivate?.(place.id);
            }
          }}
        >
          <PlaceRow
            idx={displayIdx - 1}
            place={place}
            active={active && !isDragging}
            hovered={hovered && !isDragging}
          />
        </div>

        {/* Edit / delete affordances. Edit hidden for Google-API-sourced
            places (placeIdExternal set) — those rows are derived data and
            should be replaced via search, not hand-edited. */}
        {canEdit && !place.synthetic ? (
          <div className="absolute right-5 bottom-3 flex items-center gap-1 pointer-coarse:gap-4 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
            {busy ? (
              <span
                className="inline-flex h-7 w-7 items-center justify-center"
                aria-label={t('place_working_aria')}
              >
                <Spinner size={16} color="var(--brand)" trackColor="color-mix(in srgb, var(--brand) 20%, transparent)" />
              </span>
            ) : (
              <>
                <PlaceNoteLauncher
                  placeId={place.id}
                  placeName={place.name}
                  note={place.note ?? null}
                  action={updateNoteAction}
                />
                {!['geoapify', 'osm'].includes(placeProvider(place.placeIdExternal) ?? '') ? (
                  <Link
                    href={`${editHrefBase}/${place.id}/edit`}
                    aria-label={t('place_edit_aria', { name: place.name })}
                    className="tp-hit rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
                  >
                    <Edit width={16} height={16} />
                  </Link>
                ) : null}
                <form action={removeAction}>
                  <input type="hidden" name="placeId" value={place.id} />
                  <SubmitButton
                    variant="ghost"
                    size="icon"
                    aria-label={t('place_remove_from_day_aria', { name: place.name })}
                    className="h-8 w-8 rounded-full text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash width={16} height={16} />
                  </SubmitButton>
                </form>
              </>
            )}
          </div>
        ) : canEdit && place.editHref ? (
          <HotelStopEdit href={place.editHref} name={place.name} />
        ) : null}
      </div>

      {/* Segment that follows this place */}
      {segment ? (
        <Segment
          mode={segment.mode}
          distance={segment.distance}
          time={segment.time}
          from={place}
          to={nextPlace}
          dayId={dayId}
          idx={segment.idx ?? segmentIdx}
          canEdit={canEdit}
          editHrefBase={editHrefBase}
          setModeAction={segment.setModeAction ?? setSegmentModeAction}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StaticItem — SSR-safe fallback rendered before dnd-kit hydrates
// Hotel stops are derived from a hotel booking — edit (or delete) the booking.
function HotelStopEdit({ href, name }: { href: string; name: string }) {
  const t = useT();
  return (
    <div className="absolute right-5 bottom-3 flex items-center gap-1 pointer-coarse:gap-4 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
      <Link
        href={href}
        aria-label={t('place_edit_stay_aria', { name })}
        className="tp-hit rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <Edit width={16} height={16} />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Static fallback rendered during SSR + first client paint, before
// dnd-kit takes over. Matches SortableItem markup minus drag handle
// listeners — preserves layout so swap is invisible to the user.
export function StaticItem({
  place,
  displayIdx,
  segment,
  nextPlace,
  editHrefBase,
  removeAction,
  updateNoteAction,
  canEdit = true,
  dayId,
  busy = false,
}: ItemProps) {
  const t = useT();
  const hovered = useIsPlaceHovered(dayId, place.id, 'map');
  useEffect(() => () => clearPlaceHover('list', place.id), [place.id]);
  return (
    <div className={styles.row}>
      <div className="group relative flex items-start" {...rowHoverHandlers(dayId, place.id)}>
        {canEdit && !place.synthetic ? (
          <button
            type="button"
            aria-label={t('place_reorder_aria', { name: place.name })}
            className={styles.handle}
            disabled
          >
            <Drag width={14} height={14} />
          </button>
        ) : (
          <span className={styles.handle} aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <PlaceRow idx={displayIdx - 1} place={place} hovered={hovered} />
        </div>
        {canEdit && !place.synthetic ? (
          <div className="absolute right-5 bottom-3 flex items-center gap-1 pointer-coarse:gap-4 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
            {busy ? (
              <span className="inline-flex h-7 w-7 items-center justify-center" aria-label={t('place_working_aria')}>
                <Spinner size={16} color="var(--brand)" trackColor="color-mix(in srgb, var(--brand) 20%, transparent)" />
              </span>
            ) : (
              <>
                <PlaceNoteLauncher
                  placeId={place.id}
                  placeName={place.name}
                  note={place.note ?? null}
                  action={updateNoteAction}
                />
                <Link
                  href={`${editHrefBase}/${place.id}/edit`}
                  aria-label={t('place_edit_aria', { name: place.name })}
                  className="tp-hit rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
                >
                  <Edit width={16} height={16} />
                </Link>
                <form action={removeAction}>
                  <input type="hidden" name="placeId" value={place.id} />
                  <SubmitButton
                    variant="ghost"
                    size="icon"
                    aria-label={t('place_remove_from_day_aria', { name: place.name })}
                    className="h-8 w-8 rounded-full text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash width={16} height={16} />
                  </SubmitButton>
                </form>
              </>
            )}
          </div>
        ) : canEdit && place.editHref ? (
          <HotelStopEdit href={place.editHref} name={place.name} />
        ) : null}
      </div>
      {segment ? (
        <Segment
          mode={segment.mode}
          distance={segment.distance}
          time={segment.time}
          from={place}
          to={nextPlace}
          canEdit={canEdit}
          editHrefBase={editHrefBase}
        />
      ) : null}
    </div>
  );
}
