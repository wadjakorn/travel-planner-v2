'use client';

import { useSyncExternalStore } from 'react';
import {
  getPlaceHover,
  hoverIdFor,
  subscribePlaceHover,
  type HoverSource,
  type PlaceHover,
} from '@/lib/maps/hover-store';

/** The hover (either source) when it belongs to `dayId`; the store's own object, so stable. */
export function usePlaceHoverFor(dayId: string | null | undefined): PlaceHover | null {
  return useSyncExternalStore(
    subscribePlaceHover,
    () => {
      const h = getPlaceHover();
      return h && dayId && h.dayId === dayId ? h : null;
    },
    () => null,
  );
}

/** Boolean selector: a hover change re-renders only the rows whose highlight flips. */
export function useIsPlaceHovered(
  dayId: string | null | undefined,
  placeId: string,
  source: HoverSource,
): boolean {
  return useSyncExternalStore(
    subscribePlaceHover,
    () => hoverIdFor(getPlaceHover(), dayId, source) === placeId,
    () => false,
  );
}
