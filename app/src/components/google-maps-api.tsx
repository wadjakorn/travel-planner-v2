'use client';

import type { ReactNode } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useGoogleMapsConfig } from './maps-config-provider';

// The single Google Maps JS loader wrapper. Every Google map mounts under this
// with identical parameters (apiKey only: no libraries, version or
// solutionChannel), otherwise Google warns "Maps JavaScript API has already
// been loaded with different parameters". A load error degrades the whole
// page session to MapLibre.
export function GoogleMapsApi({ children }: { children: ReactNode }) {
  const { browserKey, markDegraded } = useGoogleMapsConfig();
  return (
    <APIProvider apiKey={browserKey} onError={markDegraded}>
      {children}
    </APIProvider>
  );
}
