import type { Translate } from './i18n-client';
import { isGooglePlaceId } from './places/place-id';

export type Mode = 'drive' | 'walk' | 'transit';

export type Pin = {
  id: string;
  idx: number;
  kind: 'hotel' | 'food' | 'sight' | 'transit';
  lat: number;
  lng: number;
  name?: string;
  category?: string | null;
  time?: string | null;
  /** Google place id, when the stop came from Google: the pin card fetches a fresh photo for it. */
  googleId?: string | null;
};

/** One visit-order leg of a day's route, drawn as an arc between two pins. */
export type MapLeg = {
  /** Position in the day's `pins` array (0-based), not `Pin.idx`. */
  from: number;
  to: number;
  /** Mode the list shows for this leg; null = no stored mode (no badge). */
  mode: Mode | null;
  /** Colour slot from `legSlot`: the list shows this leg in the same colour. */
  slot: number;
};

export function pinGoogleId(placeIdExternal: string | null | undefined): string | null {
  return placeIdExternal && isGooglePlaceId(placeIdExternal) ? placeIdExternal : null;
}

// Pin color per kind: CSS var references to the light-locked `--map-pin-*`
// tokens in globals.css (DOM consumers only: MapPin, StopNumber).
export const KIND_COLOR: Record<string, string> = {
  hotel: 'var(--map-pin-stay)',
  food: 'var(--map-pin-food)',
  sight: 'var(--map-pin-sight)',
  transit: 'var(--map-pin-other)',
};

// Raw-hex mirrors of `--map-leg-*` / `--map-route-casing` (Google Polyline
// strokeColor and MapLibre paint can't read CSS vars). Parity-tested in
// map-tokens.test.ts.
/** One per route leg, cycled by `legSlot`: the arc and its mode-badge ring. */
export const LEG_COLORS = [
  '#0f766e', // hex-ok: mirrors --map-leg-1 (parity-tested)
  '#b45309', // hex-ok: mirrors --map-leg-2 (parity-tested)
  '#0369a1', // hex-ok: mirrors --map-leg-3 (parity-tested)
  '#be185d', // hex-ok: mirrors --map-leg-4 (parity-tested)
  '#1e40af', // hex-ok: mirrors --map-leg-5 (parity-tested)
  '#b91c1c', // hex-ok: mirrors --map-leg-6 (parity-tested)
  '#334155', // hex-ok: mirrors --map-leg-7 (parity-tested)
  '#a21caf', // hex-ok: mirrors --map-leg-8 (parity-tested)
  '#15803d', // hex-ok: mirrors --map-leg-9 (parity-tested)
  '#7c3aed', // hex-ok: mirrors --map-leg-10 (parity-tested)
] as const;
/** White casing under every route line, for legibility on busy basemaps. */
export const ROUTE_CASING_COLOR = '#ffffff'; // hex-ok: mirrors --map-route-casing (parity-tested)

export type LatLng = { lat: number; lng: number };

export function centroid(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return { lat, lng };
}

export function deriveZoom(points: readonly LatLng[]): number {
  if (points.length < 2) return 14;
  const latSpread =
    Math.max(...points.map((p) => p.lat)) - Math.min(...points.map((p) => p.lat));
  if (latSpread > 1) return 8;
  if (latSpread > 0.1) return 11;
  return 14;
}

export function pinBounds(points: readonly LatLng[]): [[number, number], [number, number]] | null {
  if (points.length < 2) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

// Day-fit camera parameters, shared by the MapLibre and Google renderers.
export const FIT_PADDING = 48;
export const FIT_MAX_ZOOM = 14;

export type FitPadding = { top: number; right: number; bottom: number; left: number };

// Bottom-anchored drops reach ~60px above their coordinate, so the top edge
// keeps more room than the others.
const FIT_PADDING_TOP = 64;

// md+ the map's top row (map-day-bar.tsx: 16px inset + 46px bar) covers the
// top edge, and markers/popups paint under it. No strip ⇔ md+ (the section is
// hidden below md outside mobile full-map), so the row is there exactly then.
export const MAP_TOP_ROW = 62;
export function mapTopInset(stripVisible: boolean): number {
  return stripVisible ? 0 : MAP_TOP_ROW;
}

// Mobile full-map: the stop carousel (+ day switcher) covers the bottom of the
// map (134 tall above the section's bottom edge), so a day fit keeps pins above
// it, with 28 for what hangs below a coordinate (an active pin's name label, a
// stay's square). The top keeps room for a pin's body (~60px above its coordinate).
export const MOBILE_FIT_TOP = 72;
const MOBILE_FIT_BOTTOM = 162;
export function fitPadding(stripVisible: boolean): FitPadding {
  return stripVisible
    ? { top: MOBILE_FIT_TOP, right: FIT_PADDING, bottom: MOBILE_FIT_BOTTOM, left: FIT_PADDING }
    : { top: MAP_TOP_ROW + FIT_PADDING_TOP, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING };
}

// pinBounds' [[west,south],[east,north]] as a google.maps.LatLngBoundsLiteral.
export function toGoogleBounds(
  b: [[number, number], [number, number]],
): { south: number; west: number; north: number; east: number } {
  const [[west, south], [east, north]] = b;
  return { south, west, north, east };
}

// The trip map section is `hidden md:block`, and mobile full-map mode
// (body[data-fullmap='1']) forces it visible.
export function isTripMapVisible(wide: boolean, fullmap: string | undefined): boolean {
  return wide || fullmap === '1';
}

const WORLD_VIEW = { center: { lat: 20, lng: 0 }, zoom: 2 };

/** Mount-time camera: the points, else the preview, else the world (never a hardcoded city). */
export function initialCamera(
  points: readonly LatLng[],
  preview: LatLng | null,
): { center: LatLng; zoom: number } {
  const c = centroid(points);
  if (c) return { center: c, zoom: deriveZoom(points) };
  if (preview) return { center: { lat: preview.lat, lng: preview.lng }, zoom: FIT_MAX_ZOOM };
  return { center: { ...WORLD_VIEW.center }, zoom: WORLD_VIEW.zoom };
}

export type DayFallback = { points: LatLng[]; from: 'prev-day' | 'stay' | 'trip'; dayIdx?: number };

// What an empty day frames: the nearest earlier day with pins, else the
// upcoming stay, else every located place of the trip. Null when the day has
// pins of its own or the trip has none at all.
export function emptyDayFallback(
  days: readonly { idx: number; pins: readonly Pin[] }[],
  dayIdx: number,
): DayFallback | null {
  if (!days[dayIdx] || days[dayIdx].pins.length > 0) return null;
  for (let i = dayIdx - 1; i >= 0; i--) {
    if (days[i].pins.length) return { from: 'prev-day', dayIdx: days[i].idx, points: [...days[i].pins] };
  }
  for (let i = dayIdx + 1; i < days.length; i++) {
    const stay = days[i].pins.find((p) => p.kind === 'hotel');
    if (stay) return { from: 'stay', points: [stay] };
  }
  const all = days.flatMap((d) => d.pins);
  return all.length ? { from: 'trip', points: all } : null;
}

export function emptyDayNote(dayNumber: number, f: DayFallback, t: Translate): string {
  if (f.from === 'prev-day') return t('map_empty_day_prev', { n: dayNumber, prev: (f.dayIdx ?? 0) + 1 });
  return t(f.from === 'stay' ? 'map_empty_day_stay' : 'map_empty_day_trip', { n: dayNumber });
}

/** Camera-frame identity for ActiveFocus: the pin ids, or the fallback on an empty day (so empty → empty still refits). */
export function frameSig(pins: readonly Pin[], fallback: readonly LatLng[]): string {
  if (pins.length) return pins.map((p) => p.id).join('|');
  return fallback.length ? `fallback:${fallback.map((p) => `${p.lat},${p.lng}`).join('|')}` : '';
}

/**
 * Which pin popups show (review M6): the active pin keeps its card while a
 * hovered other pin gets a separate name tooltip. A search preview owns the
 * only popup; `hideCard` = the mobile stop strip shows the card instead.
 */
export function pinPopups(o: {
  hoveredId: string | null;
  activeId: string | null;
  preview: boolean;
  hideCard: boolean;
}): { cardId: string | null; tipId: string | null } {
  if (o.preview) return { cardId: null, tipId: null };
  return {
    cardId: o.activeId && !o.hideCard ? o.activeId : null,
    tipId: o.hoveredId && o.hoveredId !== o.activeId ? o.hoveredId : null,
  };
}
