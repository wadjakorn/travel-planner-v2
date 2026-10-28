'use client';

// Tap a Google POI on the trip map (TP-0077): resolve it with the `poi` field
// set and show it through the shared map preview (TP-0062), whose Add puts it
// on the map's current day.

import { startTransition, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { addPlaceInlineAction } from '@/app/actions/places';
import { createCachedLookup, toMapPreviewData } from '@/lib/map-preview';
import { fetchDetail, resolvePlace } from '@/lib/places/client';
import { placeFormData } from '@/lib/places/pick';
import type { PlaceDetail } from '@/lib/places/types';
import { useMapPreview } from './map-preview-context';
import { useToast } from './toast';

const OWNER = 'poi';

// Page-session memory only: Places details are never stored before Add (ToS).
// A failed lookup is not cached, so tapping again retries.
const lookupPoi = createCachedLookup<PlaceDetail>((id) =>
  fetchDetail({ id, name: '', secondary: null, address: null, lat: null, lng: null, kind: 'sight', timeZone: null }, null, 'poi'),
);

const isNextControlFlow = (e: unknown) =>
  !!e && typeof e === 'object' && 'digest' in e && typeof (e as { digest: unknown }).digest === 'string' &&
  ((e as { digest: string }).digest.startsWith('NEXT_REDIRECT') || (e as { digest: string }).digest === 'NEXT_NOT_FOUND');

export function usePoiPreview(o: {
  enabled: boolean;
  dayId: string | null;
  dayLabel: string;
}): ((placeId: string) => void) | undefined {
  const { enabled, dayId, dayLabel } = o;
  const router = useRouter();
  const { toast } = useToast();
  const { preview, begin, isCurrent, setPreview, clearPreview } = useMapPreview();
  const close = useCallback(() => clearPreview(OWNER), [clearPreview]);

  const add = useCallback(
    async (detail: PlaceDetail, targetDay: string): Promise<boolean> => {
      const place = await resolvePlace(detail, { session: null, fields: 'full' });
      if (!place) {
        toast({ variant: 'error', title: "Couldn't add place", description: 'Try again or search for it.' });
        return false;
      }
      startTransition(async () => {
        try {
          await addPlaceInlineAction(placeFormData(targetDay, place));
          router.refresh();
          toast({ variant: 'success', title: 'Place added' });
        } catch (e) {
          if (isNextControlFlow(e)) throw e;
          toast({ variant: 'error', title: "Couldn't add place", description: e instanceof Error ? e.message : undefined });
        } finally {
          close(); // added (or failed): the numbered pin takes over
        }
      });
      return true;
    },
    [close, router, toast],
  );

  const onPoiClick = useCallback(
    async (placeId: string) => {
      if (!dayId) return;
      const token = begin();
      const detail = await lookupPoi(placeId);
      if (!isCurrent(token)) return;
      if (!detail) {
        toast({ variant: 'error', title: "Couldn't load that place", description: 'Try again or search for it.' });
        return;
      }
      setPreview(
        { ...toMapPreviewData(detail), ownerId: OWNER, dayLabel, onAdd: () => add(detail, dayId), onClose: close },
        token,
      );
    },
    [add, begin, close, dayId, dayLabel, isCurrent, setPreview, toast],
  );

  // The card's Add targets the day it was opened on: leaving that day closes it.
  const shownDay = useRef(dayId);
  useEffect(() => {
    if (shownDay.current === dayId) return;
    shownDay.current = dayId;
    close();
  }, [dayId, close]);

  const poiShown = preview?.ownerId === OWNER;
  useEffect(() => {
    if (!poiShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [poiShown, close]);

  return enabled && dayId ? (id) => void onPoiClick(id) : undefined;
}
