'use client';

import { useSyncExternalStore } from 'react';
import { isTripMapVisible } from '@/lib/map-helpers';

// Whether the trip map section is on screen: `hidden md:block` (768px is
// Tailwind's md) or mobile full-map mode (body[data-fullmap], set by
// map-panel-toggle.tsx). Server snapshot is false.

export const WIDE_QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener('change', onChange);
  const obs = new MutationObserver(onChange);
  obs.observe(document.body, { attributes: true, attributeFilter: ['data-fullmap'] });
  return () => {
    mql.removeEventListener('change', onChange);
    obs.disconnect();
  };
}

function getSnapshot(): boolean {
  return isTripMapVisible(window.matchMedia(WIDE_QUERY).matches, document.body.dataset.fullmap);
}

export function useTripMapVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function subscribeWide(onChange: () => void): () => void {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** md+ (list and map side by side). Server snapshot is false. */
export function useIsWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
}
