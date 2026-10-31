'use client';

// SortablePlaceList — wraps the read-only place rows + segments with
// dnd-kit drag-and-drop reordering inside a single day. Optimistic UI:
// reorders locally on drop, then fires the server action.

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  useTransition,
  useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast';
import { useT } from '@/components/i18n-provider';
import { isNavigationError, logActionFailure } from '@/lib/action-errors';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type Announcements,
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
import { legSlot } from '@/lib/map-route';
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
  const t = useT();
  // dnd-kit's screen-reader text, translated. English keys are the library's
  // defaults word for word (same ids announced), so English is unchanged.
  const accessibility = useMemo(() => {
    const announcements: Announcements = {
      onDragStart: ({ active }) => t('itin_dnd_start', { id: String(active.id) }),
      onDragOver: ({ active, over }) =>
        over
          ? t('itin_dnd_over', { id: String(active.id), over: String(over.id) })
          : t('itin_dnd_over_none', { id: String(active.id) }),
      onDragEnd: ({ active, over }) =>
        over
          ? t('itin_dnd_end', { id: String(active.id), over: String(over.id) })
          : t('itin_dnd_end_none', { id: String(active.id) }),
      onDragCancel: ({ active }) => t('itin_dnd_cancel', { id: String(active.id) }),
    };
    return { announcements, screenReaderInstructions: { draggable: t('itin_dnd_instructions') } };
  }, [t]);
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
  // The spinner belongs to the row whose navigation is in flight, so derive it
  // from the transition rather than clearing the id in an effect.
  const activatingId = activatePending ? pendingActivateId : null;
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [pendingMoveId, setPendingMoveId] = useState<string | null>(null);
  const [, startMoveTransition] = useTransition();
  // pendingMoveId drives a day-level overlay via onMoveBusyChange because
  // a reorder can shift every row + segment in the day. Keep the callback in a
  // ref so this effect fires only when the busy state actually changes — the
  // parent passes a fresh inline closure every render, and depending on it here
  // would re-run the effect (and its setState) on every render → update loop.
  const onMoveBusyChangeRef = useRef(onMoveBusyChange);
  // Written in an effect, not during render: a ref is not render output, and
  // this one runs before the notifying effect below either way.
  useEffect(() => {
    onMoveBusyChangeRef.current = onMoveBusyChange;
  });
  useEffect(() => {
    onMoveBusyChangeRef.current?.(pendingMoveId !== null);
  }, [pendingMoveId]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingPlace = draggingId
    ? places.find((p) => p.id === draggingId) ?? null
    : null;
  // Sync local state with new server props (after revalidation). Done during
  // render — in an effect the list would paint stale for one frame.
  // Skipped while a drag-reorder is mid-flight to avoid clobbering optimistic order.
  const [lastInitialPlaces, setLastInitialPlaces] = useState(initialPlaces);
  if (initialPlaces !== lastInitialPlaces && !pendingMoveId) {
    setLastInitialPlaces(initialPlaces);
    setPlaces(initialPlaces);
  }
  // dnd-kit increments a module-level counter for aria-describedby. SSR
  // and client diverge → hydration mismatch. Defer dnd-kit render until
  // after mount; SSR sends the static list, client swaps to draggable.
  // useSyncExternalStore rather than setState-in-effect: same "am I on the
  // client" answer without the extra render pass.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

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
          if (isNavigationError(e)) throw e;
          logActionFailure('reorder', e);
          toast({ variant: 'error', title: t('itin_reorder_error_toast'), description: t('err_try_again_body') });
        } finally {
          setPendingMoveId((cur) => (cur === movedId ? null : cur));
        }
      });
    },
    [places, tripId, dayId, reorderAction, toast, t],
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
            legSlot={legSlot(i, place, places[i + 1])}
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
      accessibility={accessibility}
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
              legSlot={legSlot(i, place, places[i + 1])}
              setSegmentModeAction={setSegmentModeAction}
              active={place.id === activePlaceId}
              onActivate={onActivate}
              busy={activatingId === place.id}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {draggingPlace ? (
          <div className={`${styles.row} ${styles.overlay}`}>
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
