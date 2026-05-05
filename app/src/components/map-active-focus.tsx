'use client';

import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import type { Pin } from '@/lib/map-helpers';

export function ActiveFocus({
  activePin,
  pinsSig,
}: {
  activePin: Pin | null;
  pinsSig: string;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || !activePin) return;
    map.panTo({ lat: activePin.lat, lng: activePin.lng });
  }, [map, activePin, pinsSig]);

  useEffect(() => {
    if (!map || !activePin) return;
    function onResize() {
      if (!map || !activePin) return;
      google.maps.event.trigger(map, 'resize');
      map.panTo({ lat: activePin.lat, lng: activePin.lng });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [map, activePin]);
  return null;
}
