'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import { FIT_MAX_ZOOM, centroid, fitPadding, deriveZoom, pinBounds, type Pin } from '@/lib/map-helpers';
import { PREVIEW_OFFSET_Y, PREVIEW_ZOOM, mapFocus } from '@/lib/map-preview';

export function ActiveFocus({
  activePin,
  pins,
  pinsSig,
  preview,
  stripVisible = false,
}: {
  activePin: Pin | null;
  pins: Pin[];
  pinsSig: string;
  preview?: { id: string; lat: number; lng: number } | null;
  /** Mobile stop carousel showing: fit the day above it. */
  stripVisible?: boolean;
}) {
  const { current: map } = useMap();
  const prevActiveId = useRef<string | null>(activePin?.id ?? null);
  const prevPreviewId = useRef<string | null>(preview?.id ?? null);
  const prevPinsSig = useRef(pinsSig);
  // Zoom from before a search preview, restored when it exits to a pin.
  const savedZoom = useRef<number | null>(null);
  // Read at fit time only: showing/hiding the strip alone must not refit.
  const strip = useRef(stripVisible);
  useLayoutEffect(() => {
    strip.current = stripVisible;
  }, [stripVisible]);

  // Persistent map: initialViewState only applies at mount, so this keeps the
  // view in sync as the day (pin set) changes without a remount. A search
  // preview flies to itself; an active pin pans to it; otherwise refit the day.
  useEffect(() => {
    if (!map) return;
    const activeChanged = (activePin?.id ?? null) !== prevActiveId.current;
    prevActiveId.current = activePin?.id ?? null;
    const previewExited = prevPreviewId.current != null && !preview;
    prevPreviewId.current = preview?.id ?? null;
    const pinsChanged = pinsSig !== prevPinsSig.current;
    prevPinsSig.current = pinsSig;
    const f = mapFocus(preview ?? null, activePin, activeChanged, previewExited, pinsChanged);
    if (f.kind === 'stay') {
      savedZoom.current = null;
      return;
    }
    if (f.kind === 'preview') {
      if (savedZoom.current == null) savedZoom.current = map.getZoom();
      const go = () =>
        map.easeTo({ center: [f.lng, f.lat], zoom: Math.max(map.getZoom(), PREVIEW_ZOOM), offset: [0, PREVIEW_OFFSET_Y] });
      // Mobile "View on map" flips the hidden (0x0) section visible in the
      // same tick: wait for a real size, or the camera lands off-centre.
      const el = map.getContainer();
      if (el.offsetWidth > 0) {
        go();
        return;
      }
      const ro = new ResizeObserver(() => {
        if (el.offsetWidth === 0) return;
        ro.disconnect();
        map.resize();
        go();
      });
      ro.observe(el);
      return () => ro.disconnect();
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
      map.fitBounds(bounds, { padding: fitPadding(strip.current), maxZoom: FIT_MAX_ZOOM, duration: 0 });
      return;
    }
    const c = centroid(pins);
    map.jumpTo({ center: [c.lng, c.lat], zoom: deriveZoom(pins) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activePin, pinsSig, preview?.id]);

  return null;
}
