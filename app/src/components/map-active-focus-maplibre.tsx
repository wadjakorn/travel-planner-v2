'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useMap } from 'react-map-gl/maplibre';
import {
  FIT_MAX_ZOOM,
  fitPadding,
  initialCamera,
  pinBounds,
  type FitPadding,
  type LatLng,
  type Pin,
} from '@/lib/map-helpers';
import { activeSafeArea, previewPadding, previewSafeArea, revealPan } from '@/lib/map-camera';
import { POI_PREVIEW_OWNER, PREVIEW_OFFSET_Y, PREVIEW_ZOOM, mapFocus } from '@/lib/map-preview';

export function ActiveFocus({
  activePin,
  pins,
  frameSig,
  fallback = [],
  preview,
  stripVisible = false,
}: {
  activePin: Pin | null;
  pins: Pin[];
  /** lib/map-helpers frameSig(pins, fallback): a change means a new frame. */
  frameSig: string;
  /** Empty day: what to frame instead (emptyDayFallback). */
  fallback?: LatLng[];
  preview?: { id: string; lat: number; lng: number; ownerId?: string } | null;
  /** Mobile stop carousel showing: fit the day above it. */
  stripVisible?: boolean;
}) {
  const { current: map } = useMap();
  const prevActiveId = useRef<string | null>(activePin?.id ?? null);
  const prevPreviewId = useRef<string | null>(preview?.id ?? null);
  const prevFrameSig = useRef(frameSig);
  // Zoom from before a search preview, restored when it exits to a pin.
  const savedZoom = useRef<number | null>(null);
  // Read at fit time only: showing/hiding the strip alone must not refit.
  const strip = useRef(stripVisible);
  useLayoutEffect(() => {
    strip.current = stripVisible;
  }, [stripVisible]);

  // Persistent map: initialViewState only applies at mount, so this keeps the
  // view in sync. Camera rules (TP-0095, lib/map-preview mapFocus): a selected
  // stop or a tapped POI is only revealed (minimal pan, if any); a search
  // preview frames the day with it; a day change refits the day (or an empty
  // day's fallback). MapLibre's easeTo/panBy/fitBounds already go instant
  // under prefers-reduced-motion.
  useEffect(() => {
    if (!map) return;
    const activeChanged = (activePin?.id ?? null) !== prevActiveId.current;
    prevActiveId.current = activePin?.id ?? null;
    const previewExited = prevPreviewId.current != null && !preview;
    prevPreviewId.current = preview?.id ?? null;
    const pinsChanged = frameSig !== prevFrameSig.current;
    prevFrameSig.current = frameSig;
    const f = mapFocus({
      preview: preview
        ? { lat: preview.lat, lng: preview.lng, fromMap: preview.ownerId === POI_PREVIEW_OWNER }
        : null,
      activePin,
      activeChanged,
      previewExited,
      pinsChanged,
      pins,
      fallback,
    });
    if (f.kind === 'stay') {
      savedZoom.current = null;
      return;
    }
    const el = map.getContainer();
    const size = () => ({ width: el.offsetWidth, height: el.offsetHeight });

    // Minimal pan that brings `p` inside `safe` (none when it already is).
    const reveal = (p: LatLng, safe: FitPadding) => {
      const s = size();
      if (!s.width || !s.height) {
        map.jumpTo({ center: [p.lng, p.lat] });
        return;
      }
      const { dx, dy } = revealPan(map.project([p.lng, p.lat]), s, safe);
      if (dx || dy) map.panBy([dx, dy]);
    };

    if (f.kind === 'preview' || f.kind === 'preview-fit' || f.kind === 'preview-reveal') {
      // A tapped POI never changes the zoom, so there is nothing to restore:
      // leaving it for a stop then reveals the stop instead of re-centring.
      if (savedZoom.current == null && f.kind !== 'preview-reveal') savedZoom.current = map.getZoom();
      // Preview alone, below the centre so its card (above it) fits.
      const alone = (p: LatLng) =>
        map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), PREVIEW_ZOOM), offset: [0, PREVIEW_OFFSET_Y] });
      const go = () => {
        if (f.kind === 'preview') return void alone(f);
        if (f.kind === 'preview-reveal') return reveal(f, previewSafeArea(fitPadding(strip.current)));
        const pad = previewPadding(size(), strip.current);
        const b = pinBounds(f.points);
        if (pad && b) map.fitBounds(b, { padding: pad, maxZoom: FIT_MAX_ZOOM });
        else alone(f.points[f.points.length - 1]);
      };
      // Mobile "View on map" flips the hidden (0x0) section visible in the
      // same tick: wait for a real size, or the camera lands off-centre.
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
      // Leaving a preview for a stop: back to the pre-preview zoom, on the stop.
      if (zoom != null) map.easeTo({ center: [f.lng, f.lat], zoom });
      else reveal(f, activeSafeArea(fitPadding(strip.current), !strip.current));
      return;
    }
    const points = f.kind === 'fit' ? pins : f.points;
    if (points.length === 0) return;
    const bounds = pinBounds(points);
    if (bounds) {
      map.fitBounds(bounds, { padding: fitPadding(strip.current), maxZoom: FIT_MAX_ZOOM, duration: 0 });
      return;
    }
    const cam = initialCamera(points, null);
    map.jumpTo({ center: [cam.center.lng, cam.center.lat], zoom: cam.zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activePin, frameSig, preview?.id]);

  return null;
}
