import { FIT_PADDING, fitPadding, mapTopInset, type FitPadding, type LatLng } from './map-helpers';

// Pure camera pixel math for the trip map (TP-0095), shared by the Google and
// MapLibre ActiveFocus adapters. Assumes a flat camera (tilt 0, heading 0).

export type Size = { width: number; height: number };
/** Google zoom: the world is 256·2^zoom CSS px wide. */
export type Cam = { center: LatLng; zoom: number };

// Room above a pin for the card that opens on it: card height + the
// bottom-anchored drop's popup offset (lib/map-pin.ts, active 62 / preview 52),
// and half the card's width on each side.
export const ACTIVE_CARD_CLEARANCE = { top: 330, side: 136 }; // pin card 240 wide, ~268 tall with photo
export const PREVIEW_CARD_CLEARANCE = { top: 370, side: 150 }; // preview card 260 wide, photo 120 + actions
/** Smallest usable safe span (px); below it the point is centred on that axis. */
export const MIN_SAFE = 120;

const MAX_LAT = 85.05113;

function worldPx(p: LatLng, zoom: number): { x: number; y: number } {
  const size = 256 * 2 ** zoom;
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat));
  const phi = (lat * Math.PI) / 180;
  const x = (p.lng + 180) / 360;
  const y = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
  return { x: x * size, y: y * size };
}

function fromWorldPx(x: number, y: number, zoom: number): LatLng {
  const size = 256 * 2 ** zoom;
  const lng = (x / size) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / size);
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return { lat, lng };
}

/** Container pixel of `p` for a flat camera. */
export function toViewPx(p: LatLng, cam: Cam, size: Size): { x: number; y: number } {
  const c = worldPx(cam.center, cam.zoom);
  const w = worldPx(p, cam.zoom);
  return { x: w.x - c.x + size.width / 2, y: w.y - c.y + size.height / 2 };
}

/** The camera centre after `panBy(dx, dy)` (positive dx moves the view east). */
export function offsetCenter(cam: Cam, dx: number, dy: number): LatLng {
  const c = worldPx(cam.center, cam.zoom);
  return fromWorldPx(c.x + dx, c.y + dy, cam.zoom);
}

function axisPan(v: number, lo: number, hi: number, full: number): number {
  if (hi - lo < MIN_SAFE) return v - full / 2;
  return v < lo ? v - lo : v > hi ? v - hi : 0;
}

/** The smallest `panBy` that brings `pt` inside the safe rect (0,0 when it already is). */
export function revealPan(pt: { x: number; y: number }, size: Size, safe: FitPadding): { dx: number; dy: number } {
  return {
    dx: axisPan(pt.x, safe.left, size.width - safe.right, size.width),
    dy: axisPan(pt.y, safe.top, size.height - safe.bottom, size.height),
  };
}

/**
 * Safe rect for a selected stop: room for its card above it when the card
 * shows. `topInset`: chrome over the map's top edge (md+ day bar,
 * `mapTopInset`), which the card's top (✕) must clear too.
 */
export function activeSafeArea(pad: FitPadding, cardShown: boolean, topInset = 0): FitPadding {
  if (!cardShown) return pad;
  const { top, side } = ACTIVE_CARD_CLEARANCE;
  return {
    top: Math.max(pad.top, top + topInset),
    right: Math.max(pad.right, side),
    bottom: pad.bottom,
    left: Math.max(pad.left, side),
  };
}

/** Safe rect for a tapped map POI: its preview card always shows. `topInset` as in `activeSafeArea`. */
export function previewSafeArea(pad: FitPadding, topInset = 0): FitPadding {
  const { top, side } = PREVIEW_CARD_CLEARANCE;
  return {
    top: Math.max(pad.top, top + topInset),
    right: Math.max(pad.right, side),
    bottom: pad.bottom,
    left: Math.max(pad.left, side),
  };
}

/** fitBounds padding that frames the day with a search preview and keeps its card on screen; null when the map is too short. */
export function previewPadding(size: Size, stripVisible: boolean): FitPadding | null {
  const top = PREVIEW_CARD_CLEARANCE.top + mapTopInset(stripVisible);
  const bottom = fitPadding(stripVisible).bottom;
  if (size.height - top - bottom < MIN_SAFE) return null;
  const side = Math.min(PREVIEW_CARD_CLEARANCE.side, Math.max(FIT_PADDING, (size.width - MIN_SAFE) / 2));
  return { top, right: side, bottom, left: side };
}
