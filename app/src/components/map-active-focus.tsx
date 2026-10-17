'use client';

import { useEffect } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { centroid, deriveZoom, pinBounds, type Pin } from '@/lib/map-helpers';

export function ActiveFocus({
  activePin,
  pins,
  pinsSig,
}: {
  activePin: Pin | null;
  pins: Pin[];
  pinsSig: string;
}) {
  const { current: map } = useMap();

  // Persistent map: initialViewState only applies at mount, so this keeps the
  // view in sync as the day (pin set) changes without a remount. An active pin
  // pans to it; otherwise refit to the day's pins.
  useEffect(() => {
    if (!map) return;
    if (activePin) {
      map.easeTo({ center: [activePin.lng, activePin.lat] });
      return;
    }
    if (pins.length === 0) return;
    const bounds = pinBounds(pins);
    if (bounds) {
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
      return;
    }
    const c = centroid(pins);
    map.jumpTo({ center: [c.lng, c.lat], zoom: deriveZoom(pins) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activePin, pinsSig]);

  return null;
}
