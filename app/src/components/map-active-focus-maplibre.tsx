'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { FIT_MAX_ZOOM, FIT_PADDING, centroid, deriveZoom, pinBounds, type Pin } from '@/lib/map-helpers';
import { PREVIEW_ZOOM, mapFocus } from '@/lib/map-preview';

export function ActiveFocus({
  activePin,
  pins,
  pinsSig,
  preview,
}: {
  activePin: Pin | null;
  pins: Pin[];
  pinsSig: string;
  preview?: { id: string; lat: number; lng: number } | null;
}) {
  const { current: map } = useMap();
  const prevActiveId = useRef<string | null>(activePin?.id ?? null);
  // Zoom from before a search preview, restored when it exits to a pin.
  const savedZoom = useRef<number | null>(null);

  // Persistent map: initialViewState only applies at mount, so this keeps the
  // view in sync as the day (pin set) changes without a remount. A search
  // preview flies to itself; an active pin pans to it; otherwise refit the day.
  useEffect(() => {
    if (!map) return;
    const activeChanged = (activePin?.id ?? null) !== prevActiveId.current;
    prevActiveId.current = activePin?.id ?? null;
    const f = mapFocus(preview ?? null, activePin, activeChanged);
    if (f.kind === 'preview') {
      if (savedZoom.current == null) savedZoom.current = map.getZoom();
      map.easeTo({ center: [f.lng, f.lat], zoom: Math.max(map.getZoom(), PREVIEW_ZOOM) });
      return;
    }
    const zoom = savedZoom.current;
    savedZoom.current = null;
    if (f.kind === 'active') {
      map.easeTo(zoom == null ? { center: [f.lng, f.lat] } : { center: [f.lng, f.lat], zoom });
      return;
    }
    if (pins.length === 0) return;
    const bounds = pinBounds(pins);
    if (bounds) {
      map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, duration: 0 });
      return;
    }
    const c = centroid(pins);
    map.jumpTo({ center: [c.lng, c.lat], zoom: deriveZoom(pins) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activePin, pinsSig, preview?.id]);

  return null;
}
