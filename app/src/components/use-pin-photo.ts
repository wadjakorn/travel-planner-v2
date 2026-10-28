'use client';

import { createCachedLookup } from '@/lib/map-preview';
import type { PlacePhoto } from '@/lib/places/types';
import { useCachedValue } from './use-cached-value';

// Fresh photo ref per Google place, kept in memory for the page session only
// (Google ToS: photo names must not be stored). One request per place; "no
// photo" is a definite answer and is not asked again; a 503 (unavailable now)
// throws, so it is retried on the next open.
const refs = createCachedLookup<PlacePhoto>(
  async (id) => {
    const res = await fetch(`/api/places/photo-ref?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`photo-ref ${res.status}`);
    return ((await res.json()) as { photo: PlacePhoto | null }).photo;
  },
  { cacheNull: true },
);

/** The pin card's photo ref for a Google place id: undefined while loading, null when there is none. */
export function usePinPhoto(googleId: string | null | undefined): PlacePhoto | null | undefined {
  return useCachedValue(refs, googleId);
}
