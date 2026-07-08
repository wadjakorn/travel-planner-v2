'use client';

import type { ReactNode } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_ATTRIBUTION_ID,
} from '@/lib/maps-config';

type Props = { children: ReactNode };

// Single source of truth for Google Maps JS loader params. Every map/places
// surface in the app must mount through this — mismatched params warn:
// "Maps JavaScript API has already been loaded with different parameters".
//
// Uses the stable Maps JS channel (no `version` override). `places` is
// preloaded for AutocompleteSuggestion + Place.fetchFields. Per-leg routing
// is deep-linked out to Google Maps (see `lib/gmaps.ts`), so no `geometry`
// (polyline) library is needed here.
export function MapsProvider({ children }: Props) {
  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      libraries={['places']}
      solutionChannel={GOOGLE_MAPS_ATTRIBUTION_ID}
    >
      {children}
    </APIProvider>
  );
}
