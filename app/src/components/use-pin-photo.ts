'use client';

import { useEffect, useState } from 'react';
import { createCachedLookup, toPreviewPhoto, type MapPreviewPhoto } from '@/lib/map-preview';
import type { PlacePhoto } from '@/lib/places/types';

// Fresh photo ref per Google place, kept in memory for the page session only
// (Google ToS: photo names must not be stored). One request per place; a place
// without a photo is not asked again. A failed request is retried next time.
const lookup = createCachedLookup<PlacePhoto>(
  async (id) => {
    const res = await fetch(`/api/places/photo-ref?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`photo-ref ${res.status}`);
    return ((await res.json()) as { photo: PlacePhoto | null }).photo;
  },
  { cacheNull: true },
);

/** The pin card's photo for a Google place id; null while loading or when there is none. */
export function usePinPhoto(googleId: string | null | undefined): MapPreviewPhoto | null {
  const [state, setState] = useState<{ id: string; photo: MapPreviewPhoto | null } | null>(null);
  useEffect(() => {
    if (!googleId) return;
    let live = true;
    void lookup(googleId).then((p) => {
      if (live) setState({ id: googleId, photo: toPreviewPhoto(p) });
    });
    return () => {
      live = false;
    };
  }, [googleId]);
  return googleId && state?.id === googleId ? state.photo : null;
}
