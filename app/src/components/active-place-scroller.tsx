'use client';

// Desktop: when a place becomes active (e.g. its pin was clicked on the map),
// scroll its row into view inside the itinerary column. 'nearest' leaves a
// visible row alone, so clicks in the list itself never jump. Rows carry
// data-place-id (place-row.tsx), hotel rows included; ride pins have no row.
// DaysAccordion reads the same ?placeId= (and reopens a collapsed day) in the
// same commit, so the row is in the DOM by the next frame.

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function ActivePlaceScroller() {
  const placeId = useSearchParams().get('placeId');

  useEffect(() => {
    if (!placeId || !window.matchMedia('(min-width: 768px)').matches) return;
    const raf = requestAnimationFrame(() => {
      document
        .querySelector(`[data-trip-aside] [data-place-id="${CSS.escape(placeId)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [placeId]);

  return null;
}
