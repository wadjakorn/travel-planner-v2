'use client';

import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { centroid, deriveZoom, type Pin } from '@/lib/map-helpers';

export function ActiveFocus({
  activePin,
  pins,
  pinsSig,
}: {
  activePin: Pin | null;
  pins: Pin[];
  pinsSig: string;
}) {
  const map = useMap();

  // Persistent map: the <Map>'s defaultCenter/defaultZoom only apply at mount,
  // so this is what keeps the view in sync as the day (pin set) changes without
  // a remount. An active pin pans to it; otherwise refit to the day's pins.
  useEffect(() => {
    if (!map) return;
    if (activePin) {
      map.panTo({ lat: activePin.lat, lng: activePin.lng });
      return;
    }
    if (pins.length === 0) return;
    map.moveCamera({ center: centroid(pins), zoom: deriveZoom(pins) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
