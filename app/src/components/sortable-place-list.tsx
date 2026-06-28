'use client';

// SortablePlaceList — wraps the read-only place rows + segments with
// dnd-kit drag-and-drop reordering inside a single day. Optimistic UI:
// reorders locally on drop, then fires the server action.

import { useState, useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
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
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';

import { PlaceRow } from '@/components/place-row';
import { SortableItem, StaticItem } from '@/components/sortable-place-item';
import type { Place, SegmentData } from '@/components/sortable-place-item';
import styles from './sortable-place-list.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  const { toast } = useToast();
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
        } catch (e) {
          if (e && typeof e === 'object' && 'digest' in e && typeof (e as { digest: unknown }).digest === 'string' && ((e as { digest: string }).digest.startsWith('NEXT_REDIRECT') || (e as { digest: string }).digest === 'NEXT_NOT_FOUND')) throw e;
          toast({ variant: 'error', title: "Couldn't reorder", description: e instanceof Error ? e.message : undefined });
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
