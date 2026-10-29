'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import {
  FIT_MAX_ZOOM,
  fitPadding,
  mapTopInset,
  initialCamera,
  pinBounds,
  toGoogleBounds,
  type FitPadding,
  type LatLng,
  type Pin,
} from '@/lib/map-helpers';
import {
  activeSafeArea,
  offsetCenter,
  previewPadding,
  previewSafeArea,
  revealPan,
  toViewPx,
} from '@/lib/map-camera';
import { POI_PREVIEW_OWNER, PREVIEW_OFFSET_Y, PREVIEW_ZOOM, mapFocus } from '@/lib/map-preview';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ActiveFocusGoogle({
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
  const map = useMap();
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

  // Camera rules (TP-0095, lib/map-preview mapFocus): a selected stop or a
  // tapped POI is only revealed (no move when already in the safe area, else
  // a minimal pan); a search preview frames the day with it; a day change
  // refits the day (or an empty day's fallback). While the map is hidden
  // (display:none, 0x0) fits and preview moves wait until it is shown.
  // Reduced motion: moveCamera (instant) instead of panTo/panBy.
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
    const div = map.getDiv();
    const size = () => ({ width: div.offsetWidth, height: div.offsetHeight });

    // Fit `points` with `pad`, clamped to FIT_MAX_ZOOM once the fit settles.
    let clamp: google.maps.MapsEventListener | null = null;
    const fitTo = (points: LatLng[], pad: FitPadding) => {
      clamp?.remove(); // never two clamps armed
      clamp = null;
      const b = pinBounds(points);
      if (b) {
        clamp = google.maps.event.addListenerOnce(map, 'idle', () => {
          if ((map.getZoom() ?? 0) > FIT_MAX_ZOOM) map.setZoom(FIT_MAX_ZOOM);
        });
        map.fitBounds(toGoogleBounds(b), pad);
      } else {
        map.moveCamera(initialCamera(points, null));
      }
    };

    // Minimal pan that brings `p` inside `safe` (none when it already is).
    const reveal = (p: LatLng, safe: FitPadding) => {
      const s = size();
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (!s.width || !s.height || !center || zoom == null) {
        map.setCenter(p);
        return;
      }
      // The flat Mercator math is wrong on a tilted/rotated vector camera.
      if ((map.getTilt() ?? 0) !== 0 || (map.getHeading() ?? 0) !== 0) {
        if (reducedMotion()) map.moveCamera({ center: p });
        else map.panTo(p);
        return;
      }
      const cam = { center: center.toJSON(), zoom };
      const { dx, dy } = revealPan(toViewPx(p, cam, s), s, safe);
      if (!dx && !dy) return;
      if (reducedMotion()) map.moveCamera({ center: offsetCenter(cam, dx, dy) });
      else map.panBy(dx, dy);
    };

    if (f.kind === 'preview' || f.kind === 'preview-fit' || f.kind === 'preview-reveal') {
      // A tapped POI never changes the zoom, so there is nothing to restore:
      // leaving it for a stop then reveals the stop instead of re-centring.
      if (savedZoom.current == null && f.kind !== 'preview-reveal') savedZoom.current = map.getZoom() ?? null;
      // Preview alone, below the centre so its card (above it) fits.
      const alone = (p: LatLng) => {
        const z = Math.max(map.getZoom() ?? 0, PREVIEW_ZOOM);
        map.moveCamera({ zoom: z, center: offsetCenter({ center: p, zoom: z }, 0, -PREVIEW_OFFSET_Y) });
      };
      const go = () => {
        if (f.kind === 'preview') return alone(f);
        if (f.kind === 'preview-reveal') return reveal(f, previewSafeArea(fitPadding(strip.current), mapTopInset(strip.current)));
        const pad = previewPadding(size(), strip.current);
        if (pad) fitTo(f.points, pad);
        else alone(f.points[f.points.length - 1]);
      };
      if (div.offsetWidth > 0) {
        go();
        return () => clamp?.remove();
      }
      const ro = new ResizeObserver(() => {
        if (div.offsetWidth === 0) return;
        ro.disconnect();
        go();
      });
      ro.observe(div);
      return () => {
        ro.disconnect();
        clamp?.remove();
      };
    }
    const zoom = savedZoom.current;
    savedZoom.current = null;
    if (f.kind === 'active') {
      // Leaving a preview for a stop: back to the pre-preview zoom, on the stop.
      if (zoom != null) map.moveCamera({ center: { lat: f.lat, lng: f.lng }, zoom });
      else reveal(f, activeSafeArea(fitPadding(strip.current), !strip.current, mapTopInset(strip.current)));
      return; // no observer on the pan path
    }
    const points = f.kind === 'fit' ? pins : f.points;
    if (points.length === 0) return;
    const fit = () => {
      if (div.offsetWidth === 0) return; // hidden (display:none): fit later
      fitTo(points, fitPadding(strip.current));
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
      clamp?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, activePin, frameSig, preview?.id]);

  return null;
}
