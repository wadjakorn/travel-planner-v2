'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { OPEN_CLIENT_CONFIG, effectiveRenderer, type ClientMapsConfig } from '@/lib/maps/client-config';
import { onGoogleAuthFailure } from '@/lib/maps/google-auth-failure';

type Ctx = { config: ClientMapsConfig; degraded: boolean; markDegraded: () => void };

const MapsContext = createContext<Ctx>({
  config: OPEN_CLIENT_CONFIG,
  degraded: false,
  markDegraded: () => {},
});

export function MapsConfigProvider({ value, children }: { value: ClientMapsConfig; children: React.ReactNode }) {
  const [degraded, setDegraded] = useState(false);
  const warned = useRef(false);

  const markDegraded = useCallback(() => {
    if (warned.current) return;
    warned.current = true;
    console.warn('[maps] Google Maps failed to load; using MapLibre');
    setDegraded(true);
  }, []);

  const google = value.renderer === 'google';
  useEffect(() => {
    if (!google) return;
    return onGoogleAuthFailure(window, markDegraded);
  }, [google, markDegraded]);

  const ctx = useMemo(() => ({ config: value, degraded, markDegraded }), [value, degraded, markDegraded]);
  return <MapsContext.Provider value={ctx}>{children}</MapsContext.Provider>;
}

export function useMapRenderer(): 'google' | 'maplibre' {
  const { config, degraded } = useContext(MapsContext);
  return effectiveRenderer(config, degraded);
}

export function useGoogleMapsConfig(): { browserKey: string; mapId: string; markDegraded: () => void } {
  const { config, markDegraded } = useContext(MapsContext);
  return { browserKey: config.browserKey, mapId: config.mapId, markDegraded };
}
