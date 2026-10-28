'use client';

import { useEffect, useRef } from 'react';
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
import { PREVIEW_ZOOM, mapFocus } from '@/lib/map-preview';

export function ActiveFocusGoogle({
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
  const map = useMap();
  const prevActiveId = useRef<string | null>(activePin?.id ?? null);
  // Zoom from before a search preview, restored when it exits to a pin.
  const savedZoom = useRef<number | null>(null);

  // Keeps the camera in sync as the day (pin set) changes without a remount,
  // with MapLibre parity: an active pin pans to itself; otherwise frame the
  // day with FIT_PADDING, clamped to FIT_MAX_ZOOM. While the map is hidden
  // (display:none, 0x0) the fit is deferred until it is shown again.
  // A search preview flies to itself; while the map is hidden (mobile, the
  // full-map flip lands in the same tick) that move waits for a real width too.
  useEffect(() => {
    if (!map) return;
    const activeChanged = (activePin?.id ?? null) !== prevActiveId.current;
    prevActiveId.current = activePin?.id ?? null;
    const f = mapFocus(preview ?? null, activePin, activeChanged);
    const div = map.getDiv();
    if (f.kind === 'preview') {
      if (savedZoom.current == null) savedZoom.current = map.getZoom() ?? null;
      const go = () => {
        map.panTo({ lat: f.lat, lng: f.lng });
        map.setZoom(Math.max(map.getZoom() ?? 0, PREVIEW_ZOOM));
      };
      if (div.offsetWidth > 0) {
        go();
        return;
      }
      const ro = new ResizeObserver(() => {
        if (div.offsetWidth === 0) return;
        ro.disconnect();
        go();
      });
      ro.observe(div);
      return () => ro.disconnect();
    }
    const zoom = savedZoom.current;
    savedZoom.current = null;
    if (f.kind === 'active') {
      map.panTo({ lat: f.lat, lng: f.lng });
      if (zoom != null) map.setZoom(zoom);
      return; // no observer on the pan path
    }
    if (pins.length === 0) return;
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
  }, [map, activePin, pinsSig, preview?.id]);

  return null;
}
