'use client';

// SortablePlaceList — wraps the read-only place rows + segments with
// dnd-kit drag-and-drop reordering inside a single day. Optimistic UI:
// reorders locally on drop, then fires the server action.

import { useState, useCallback, useEffect, useTransition } from 'react';
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
import { PlaceNoteLauncher } from '@/components/place-note-launcher';
import { Segment } from '@/components/segment';
import { Edit, Trash, Drag } from '@/components/icons';
import { Spinner, PendingButton } from '@/components/spinner';
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
  synthetic?: boolean;
};

type SegmentData = {
  id: string;
  idx?: number;
  mode: 'drive' | 'walk' | 'transit';
  distance: string;
  time: string;
  synthetic?: boolean;
  setModeAction?: (formData: FormData) => Promise<void>;
};

type Props = {
  tripId: string;
  dayId: string;
  places: Place[];           // ordered by idx ASC
  segments: (SegmentData | null)[];   // ordered by idx ASC; len = places.len - 1
  reorderAction: (formData: FormData) => Promise<void>;
  editHrefBase: string;      // e.g. `/trip/{tripId}/place`
  removeAction: (formData: FormData) => Promise<void>;
  updateNoteAction: (formData: FormData) => Promise<void>;
  canEdit?: boolean;
  setSegmentModeAction?: (formData: FormData) => Promise<void>;
  activePlaceId?: string | null;
  dayIdx?: number;
  onMoveBusyChange?: (busy: boolean) => void;
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
  updateNoteAction: (formData: FormData) => Promise<void>;
  canEdit?: boolean;
  dayId?: string;
  segmentIdx?: number;
  setSegmentModeAction?: (formData: FormData) => Promise<void>;
  active?: boolean;
  onActivate?: (id: string) => void;
  busy?: boolean;
};

function SortableItem({
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
        {canEdit && !place.synthetic ? (
          <div className="absolute right-5 bottom-3 flex items-center gap-1">
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
  updateNoteAction,
  canEdit = true,
  setSegmentModeAction,
  activePlaceId,
  dayIdx,
  onMoveBusyChange,
}: Props) {
  const router = useRouter();
  const [activatePending, startActivateTransition] = useTransition();
  const [pendingActivateId, setPendingActivateId] = useState<string | null>(null);
  const onActivate = useCallback(
    (id: string) => {
      const next = activePlaceId === id ? '' : id;
      const qs = new URLSearchParams();
      if (typeof dayIdx === 'number') qs.set('day', String(dayIdx));
      if (next) qs.set('placeId', next);
      setPendingActivateId(id);
      startActivateTransition(() => {
        router.push(`/trip/${tripId}${qs.toString() ? `?${qs}` : ''}`, { scroll: false });
      });
    },
    [activePlaceId, dayIdx, router, tripId],
  );
  useEffect(() => {
    if (!activatePending) setPendingActivateId(null);
  }, [activatePending]);
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [pendingMoveId, setPendingMoveId] = useState<string | null>(null);
  const [, startMoveTransition] = useTransition();
  // pendingMoveId drives a day-level overlay via onMoveBusyChange because
  // a reorder can shift every row + segment in the day.
  useEffect(() => {
    onMoveBusyChange?.(pendingMoveId !== null);
  }, [pendingMoveId, onMoveBusyChange]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingPlace = draggingId
    ? places.find((p) => p.id === draggingId) ?? null
    : null;
  // Sync local state with new server props (after router.refresh).
  // Skip while a drag-reorder is mid-flight to avoid clobbering optimistic order.
  useEffect(() => {
    if (pendingMoveId) return;
    setPlaces(initialPlaces);
  }, [initialPlaces, pendingMoveId]);
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

      const movedId = String(active.id);
      setPendingMoveId(movedId);
      const fd = new FormData();
      fd.append('tripId', tripId);
      fd.append('dayId', dayId);
      fd.append(
        'placeIds',
        reordered.filter((p) => !p.synthetic).map((p) => p.id).join(','),
      );
      startMoveTransition(async () => {
        try {
          await reorderAction(fd);
        } finally {
          setPendingMoveId((cur) => (cur === movedId ? null : cur));
        }
      });
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
            updateNoteAction={updateNoteAction}
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
              updateNoteAction={updateNoteAction}
              canEdit={canEdit}
              dayId={dayId}
              segmentIdx={i}
              setSegmentModeAction={setSegmentModeAction}
              active={place.id === activePlaceId}
              onActivate={onActivate}
              busy={pendingActivateId === place.id}
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
  updateNoteAction,
  canEdit = true,
  dayId,
  segmentIdx,
  setSegmentModeAction,
  active = false,
  onActivate,
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
          <div className="absolute right-5 bottom-3 flex items-center gap-1">
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
