'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { OPEN_CLIENT_CONFIG, effectiveRenderer, type ClientMapsConfig } from '@/lib/maps/client-config';
import { degradeOnce, type DegradeReason } from '@/lib/maps/degraded';
import { onGoogleAuthFailure } from '@/lib/maps/google-auth-failure';

type MarkDegraded = (reason: DegradeReason, detail?: unknown) => void;

type Ctx = { config: ClientMapsConfig; degraded: boolean; markDegraded: MarkDegraded };

const MapsContext = createContext<Ctx>({
  config: OPEN_CLIENT_CONFIG,
  degraded: false,
  markDegraded: () => {},
});

export function MapsConfigProvider({ value, children }: { value: ClientMapsConfig; children: React.ReactNode }) {
  const [degraded, setDegraded] = useState(false);
  // Warn-once + flip once per page session. A no-op in open mode: there is no
  // Google to lose, and MapRendererBoundary also catches MapLibre's own errors.
  // onDegrade is the one hook for telemetry (map_degraded).
  const [markDegraded] = useState<MarkDegraded>(() =>
    degradeOnce(
      (...args) => console.warn(...args),
      () => setDegraded(true),
      { enabled: value.renderer === 'google' },
    ),
  );

  const google = value.renderer === 'google';
  useEffect(() => {
    if (!google) return;
    return onGoogleAuthFailure(window, () => markDegraded('auth'));
  }, [google, markDegraded]);

  const ctx = useMemo(() => ({ config: value, degraded, markDegraded }), [value, degraded, markDegraded]);
  return <MapsContext.Provider value={ctx}>{children}</MapsContext.Provider>;
}

export function useMapRenderer(): 'google' | 'maplibre' {
  const { config, degraded } = useContext(MapsContext);
  return effectiveRenderer(config, degraded);
}

export function useGoogleMapsConfig(): {
  browserKey: string;
  mapId: string;
  poiAdd: boolean;
  degraded: boolean;
  markDegraded: MarkDegraded;
} {
  const { config, degraded, markDegraded } = useContext(MapsContext);
  return { browserKey: config.browserKey, mapId: config.mapId, poiAdd: config.poiAdd, degraded, markDegraded };
}
