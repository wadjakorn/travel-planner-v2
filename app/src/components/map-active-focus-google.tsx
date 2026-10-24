'use client';

import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import {
  FIT_MAX_ZOOM,
  FIT_PADDING,
  centroid,
  deriveZoom,
  pinBounds,
  toGoogleBounds,
  type Pin,
} from '@/lib/map-helpers';

export function ActiveFocusGoogle({
  activePin,
  pins,
  pinsSig,
}: {
  activePin: Pin | null;
  pins: Pin[];
  pinsSig: string;
}) {
  const map = useMap();

  // Keeps the camera in sync as the day (pin set) changes without a remount,
  // with MapLibre parity: an active pin pans to itself; otherwise frame the
  // day with FIT_PADDING, clamped to FIT_MAX_ZOOM. While the map is hidden
  // (display:none, 0x0) the fit is deferred until it is shown again.
  useEffect(() => {
    if (!map) return;
    if (activePin) {
      map.panTo({ lat: activePin.lat, lng: activePin.lng });
      return; // no observer on the pan path
    }
    if (pins.length === 0) return;
    const div = map.getDiv();
    let h: google.maps.MapsEventListener | null = null;
    const fit = () => {
      if (div.offsetWidth === 0) return; // hidden (display:none): fit later
      h?.remove(); // never two clamps armed
      h = null;
      const b = pinBounds(pins);
      if (b) {
        h = google.maps.event.addListenerOnce(map, 'idle', () => {
          if ((map.getZoom() ?? 0) > FIT_MAX_ZOOM) map.setZoom(FIT_MAX_ZOOM);
        });
        map.fitBounds(toGoogleBounds(b), FIT_PADDING);
      } else {
        map.moveCamera({ center: centroid(pins), zoom: deriveZoom(pins) });
      }
    };
    fit();
    let lastW = div.offsetWidth; // read before observe
    const ro = new ResizeObserver(() => {
      const w = div.offsetWidth;
      if (lastW === 0 && w > 0) fit(); // shown again: refit once
      lastW = w;
    });
    ro.observe(div);
    // Load-bearing with reuseMaps: vis.gl skips clearInstanceListeners on
    // unmount, so a cached map would otherwise carry a stale clamp.
    return () => {
      ro.disconnect();
      h?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activePin, pinsSig]);

  return null;
}
