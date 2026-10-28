import type { BBox } from '@/lib/places/bias';

export type MapViewport = { tripId: string; dayId: string; bbox: BBox };

let viewport: MapViewport | null = null;
const listeners = new Set<() => void>();

export function getMapViewport(): MapViewport | null {
  return viewport;
}

export function subscribeMapViewport(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function sameViewport(a: MapViewport | null, b: MapViewport) {
  return a?.tripId === b.tripId && a.dayId === b.dayId &&
    a.bbox.south === b.bbox.south && a.bbox.west === b.bbox.west &&
    a.bbox.north === b.bbox.north && a.bbox.east === b.bbox.east;
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function setMapViewport(v: MapViewport): void {
  if (sameViewport(viewport, v)) return;
  viewport = v;
  notify();
}

export function clearMapViewport(): void {
  if (!viewport) return;
  viewport = null;
  notify();
}

export function viewportBiasFor(
  v: MapViewport | null,
  o: { pathname: string; visible: boolean; dayId?: string },
): BBox | null {
  return v && o.visible && o.dayId === v.dayId && o.pathname === `/trip/${v.tripId}` ? v.bbox : null;
}
