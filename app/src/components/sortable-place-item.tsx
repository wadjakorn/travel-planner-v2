'use client';

// SortablePlaceItem — the per-row draggable component used by SortablePlaceList.
// Exported as two named variants:
//   SortableItem  — live dnd-kit draggable row (mounted client-side)
//   StaticItem    — SSR-safe fallback rendered before dnd-kit hydrates

import Link from 'next/link';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { PlaceRow } from '@/components/place-row';
import { PlaceNoteLauncher } from '@/components/place-note-launcher';
import { Segment } from '@/components/segment';
import { Edit, Trash, Drag } from '@/components/icons';
import { Spinner, PendingButton } from '@/components/spinner';
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
      {/* Inner wrapper — relative for the hover affordances */}
      <div className="group relative flex items-start">
        {/* Drag handle — listeners + attributes go here only */}
        {canEdit && !place.synthetic ? (
          <button
            type="button"
            aria-label={`Reorder ${place.name}`}
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
          onPointerUp={(e) => {
            // Mouse: only primary button. Touch/pen: button is 0 by default.
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const t = e.target as HTMLElement;
            if (t.closest('a, button, select, input, label')) return;
            onActivate?.(place.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              const t = e.target as HTMLElement;
              if (t.closest('a, button, select, input, label')) return;
              e.preventDefault();
              onActivate?.(place.id);
            }
          }}
        >
          <PlaceRow idx={displayIdx - 1} place={place} active={active && !isDragging} />
        </div>

        {/* Edit / delete affordances. Edit hidden for Google-API-sourced
            places (placeIdExternal set) — those rows are derived data and
            should be replaced via search, not hand-edited. */}
        {canEdit && !place.synthetic ? (
          <div className="absolute right-5 bottom-3 flex items-center gap-1 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
            {busy ? (
              <span
                className="inline-flex h-7 w-7 items-center justify-center"
                aria-label="Working"
              >
                <Spinner size={16} color="#0071e3" trackColor="rgba(0,113,227,0.2)" />
              </span>
            ) : (
              <>
                <PlaceNoteLauncher
                  placeId={place.id}
                  placeName={place.name}
                  note={place.note ?? null}
                  action={updateNoteAction}
                />
                {!place.placeIdExternal ? (
                  <Link
                    href={`${editHrefBase}/${place.id}/edit`}
                    aria-label={`Edit ${place.name}`}
                    className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <Edit width={16} height={16} />
                  </Link>
                ) : null}
                <form action={removeAction}>
                  <input type="hidden" name="placeId" value={place.id} />
                  <PendingButton
                    aria-label={`Remove ${place.name}`}
                    className="rounded-full p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                    spinnerSize={16}
                    spinnerColor="#dc2626"
                    spinnerTrackColor="rgba(220,38,38,0.2)"
                  >
                    <Trash width={16} height={16} />
                  </PendingButton>
                </form>
              </>
            )}
          </div>
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
          setModeAction={segment.setModeAction ?? setSegmentModeAction}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StaticItem — SSR-safe fallback rendered before dnd-kit hydrates
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
  busy = false,
}: ItemProps) {
  return (
    <div className={styles.row}>
      <div className="group relative flex items-start">
        {canEdit && !place.synthetic ? (
          <button
            type="button"
            aria-label={`Reorder ${place.name}`}
            className={styles.handle}
            disabled
          >
            <Drag width={14} height={14} />
          </button>
        ) : (
          <span className={styles.handle} aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <PlaceRow idx={displayIdx - 1} place={place} />
        </div>
        {canEdit && !place.synthetic ? (
          <div className="absolute right-5 bottom-3 flex items-center gap-1 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
            {busy ? (
              <span className="inline-flex h-7 w-7 items-center justify-center" aria-label="Working">
                <Spinner size={16} color="#0071e3" trackColor="rgba(0,113,227,0.2)" />
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
                  aria-label={`Edit ${place.name}`}
                  className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  <Edit width={16} height={16} />
                </Link>
                <form action={removeAction}>
                  <input type="hidden" name="placeId" value={place.id} />
                  <PendingButton
                    aria-label={`Remove ${place.name}`}
                    className="rounded-full p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                    spinnerSize={16}
                    spinnerColor="#dc2626"
                    spinnerTrackColor="rgba(220,38,38,0.2)"
                  >
                    <Trash width={16} height={16} />
                  </PendingButton>
                </form>
              </>
            )}
          </div>
        ) : null}
      </div>
      {segment ? (
        <Segment
          mode={segment.mode}
          distance={segment.distance}
          time={segment.time}
          from={place}
          to={nextPlace}
        />
      ) : null}
    </div>
  );
}
