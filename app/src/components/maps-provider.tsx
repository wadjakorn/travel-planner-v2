'use client';

import type { ReactNode } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_VERSION } from '@/lib/maps-config';

type Props = { children: ReactNode };

// Single source of truth for Google Maps JS loader params. Every map/places
// surface in the app must mount through this — mismatched params warn:
// "Maps JavaScript API has already been loaded with different parameters".
export function MapsProvider({ children }: Props) {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version={GOOGLE_MAPS_VERSION}>
      {children}
    </APIProvider>
  );
}
