'use client';

// SortablePlaceList — wraps the read-only place rows + segments with
// dnd-kit drag-and-drop reordering inside a single day. Optimistic UI:
// reorders locally on drop, then fires the server action.

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';

import { PlaceRow } from '@/components/place-row';
import { Segment } from '@/components/segment';
import { Edit, Trash, Drag } from '@/components/icons';
import styles from './sortable-place-list.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
};

type Props = {
  tripId: string;
  dayId: string;
  places: Place[];           // ordered by idx ASC
  segments: SegmentData[];   // ordered by idx ASC; len = places.len - 1
  reorderAction: (formData: FormData) => Promise<void>;
  editHrefBase: string;      // e.g. `/trip/{tripId}/place`
  removeAction: (formData: FormData) => Promise<void>;
  canEdit?: boolean;
  setSegmentModeAction?: (formData: FormData) => Promise<void>;
  activePlaceId?: string | null;
  dayIdx?: number;
};

// ---------------------------------------------------------------------------
// SortableItem — one draggable place slot
// ---------------------------------------------------------------------------

type ItemProps = {
  place: Place;
  displayIdx: number;          // 1-based position in the current local order
  segment: SegmentData | null; // segment that follows this place (null for last)
  nextPlace: Place | null;
  editHrefBase: string;
  removeAction: (formData: FormData) => Promise<void>;
  canEdit?: boolean;
  dayId?: string;
  segmentIdx?: number;
  setSegmentModeAction?: (formData: FormData) => Promise<void>;
  active?: boolean;
  onActivate?: (id: string) => void;
};

function SortableItem({
  place,
  displayIdx,
  segment,
  nextPlace,
  editHrefBase,
  removeAction,
  canEdit = true,
  dayId,
  segmentIdx,
  setSegmentModeAction,
  active = false,
  onActivate,
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
        {canEdit ? (
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
        <div
          className="min-w-0 flex-1 cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={(e) => {
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
        {canEdit ? (
          <div className="absolute right-3 bottom-3 flex gap-1 rounded-lg border border-zinc-200/70 bg-white/90 p-1 shadow-sm backdrop-blur opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 dark:border-zinc-800/70 dark:bg-zinc-900/90">
            {!place.placeIdExternal ? (
              <Link
                href={`${editHrefBase}/${place.id}/edit`}
                aria-label={`Edit ${place.name}`}
                className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                <Edit width={16} height={16} />
              </Link>
            ) : null}
            <form action={removeAction}>
              <input type="hidden" name="placeId" value={place.id} />
              <button
                type="submit"
                aria-label={`Remove ${place.name}`}
                className="rounded-full p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
              >
                <Trash width={16} height={16} />
              </button>
            </form>
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
          idx={segmentIdx}
          canEdit={canEdit}
          setModeAction={setSegmentModeAction}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortablePlaceList
// ---------------------------------------------------------------------------

export function SortablePlaceList({
  tripId,
  dayId,
  places: initialPlaces,
  segments,
  reorderAction,
  editHrefBase,
  removeAction,
  canEdit = true,
  setSegmentModeAction,
  activePlaceId,
  dayIdx,
}: Props) {
  const router = useRouter();
  const onActivate = useCallback(
    (id: string) => {
      const next = activePlaceId === id ? '' : id;
      const qs = new URLSearchParams();
      if (typeof dayIdx === 'number') qs.set('day', String(dayIdx));
      if (next) qs.set('placeId', next);
      router.push(`/trip/${tripId}${qs.toString() ? `?${qs}` : ''}`, { scroll: false });
    },
    [activePlaceId, dayIdx, router, tripId],
  );
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingPlace = draggingId
    ? places.find((p) => p.id === draggingId) ?? null
    : null;
  // Sync local state with new server props (e.g. after router.refresh()
  // following an add/remove). Compare by id+order; no-op when identical
  // so user-initiated drag-reorders aren't clobbered mid-interaction.
  useEffect(() => {
    const sameOrder =
      places.length === initialPlaces.length &&
      places.every((p, i) => p.id === initialPlaces[i].id);
    if (!sameOrder) setPlaces(initialPlaces);
  }, [initialPlaces, places]);
  // dnd-kit increments a module-level counter for aria-describedby. SSR
  // and client diverge → hydration mismatch. Defer dnd-kit render until
  // after mount; SSR sends the static list, client swaps to draggable.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = places.findIndex((p) => p.id === active.id);
      const newIndex = places.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(places, oldIndex, newIndex);

      // Optimistic update
      setPlaces(reordered);

      // Fire-and-forget server action
      const fd = new FormData();
      fd.append('tripId', tripId);
      fd.append('dayId', dayId);
      fd.append('placeIds', reordered.map((p) => p.id).join(','));
      void reorderAction(fd);
    },
    [places, tripId, dayId, reorderAction],
  );

  if (!mounted || !canEdit) {
    return (
      <div className="flex flex-col">
        {places.map((place, i) => (
          <StaticItem
            key={place.id}
            place={place}
            displayIdx={i + 1}
            segment={segments[i] ?? null}
            nextPlace={places[i + 1] ?? null}
            editHrefBase={editHrefBase}
            removeAction={removeAction}
            canEdit={canEdit}
            dayId={dayId}
            segmentIdx={i}
            setSegmentModeAction={setSegmentModeAction}
            active={place.id === activePlaceId}
            onActivate={onActivate}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext
        items={places.map((p) => p.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col">
          {places.map((place, i) => (
            <SortableItem
              key={place.id}
              place={place}
              displayIdx={i + 1}
              segment={segments[i] ?? null}
              nextPlace={places[i + 1] ?? null}
              editHrefBase={editHrefBase}
              removeAction={removeAction}
              canEdit={canEdit}
              dayId={dayId}
              segmentIdx={i}
              setSegmentModeAction={setSegmentModeAction}
              active={place.id === activePlaceId}
              onActivate={onActivate}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {draggingPlace ? (
          <div className={styles.row}>
            <div className="group relative flex items-start">
              <span className={styles.handle} aria-hidden />
              <div className="min-w-0 flex-1">
                <PlaceRow
                  idx={places.findIndex((p) => p.id === draggingPlace.id)}
                  place={draggingPlace}
                  active={false}
                />
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Static fallback rendered during SSR + first client paint, before
// dnd-kit takes over. Matches SortableItem markup minus drag handle
// listeners — preserves layout so swap is invisible to the user.
function StaticItem({
  place,
  displayIdx,
  segment,
  nextPlace,
  editHrefBase,
  removeAction,
  canEdit = true,
  dayId,
  segmentIdx,
  setSegmentModeAction,
  active = false,
  onActivate,
}: ItemProps) {
  return (
    <div className={styles.row}>
      <div className="group relative flex items-start">
        {canEdit ? (
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
        {canEdit ? (
          <div className="absolute right-3 bottom-3 flex gap-1 rounded-lg border border-zinc-200/70 bg-white/90 p-1 shadow-sm backdrop-blur opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 dark:border-zinc-800/70 dark:bg-zinc-900/90">
            <Link
              href={`${editHrefBase}/${place.id}/edit`}
              aria-label={`Edit ${place.name}`}
              className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <Edit width={16} height={16} />
            </Link>
            <form action={removeAction}>
              <input type="hidden" name="placeId" value={place.id} />
              <button
                type="submit"
                aria-label={`Remove ${place.name}`}
                className="rounded-full p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
              >
                <Trash width={16} height={16} />
              </button>
            </form>
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
