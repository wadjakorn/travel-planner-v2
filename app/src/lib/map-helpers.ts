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

export function pinGoogleId(placeIdExternal: string | null | undefined): string | null {
  return placeIdExternal && isGooglePlaceId(placeIdExternal) ? placeIdExternal : null;
}

export const KIND_COLOR: Record<string, string> = {
  hotel: '#5b3fd9',
  food: '#ff8a3d',
  sight: '#0071e3',
  transit: '#1d1d1f',
};

export const MODE_COLOR: Record<Mode, string> = {
  drive: '#0071e3',
  walk: '#22a06b',
  transit: '#ff8a3d',
};

export function centroid(pins: Pin[]): { lat: number; lng: number } {
  if (pins.length === 0) return { lat: 35.65, lng: 139.74 };
  const lat = pins.reduce((s, p) => s + p.lat, 0) / pins.length;
  const lng = pins.reduce((s, p) => s + p.lng, 0) / pins.length;
  return { lat, lng };
}

export function deriveZoom(pins: Pin[]): number {
  if (pins.length < 2) return 14;
  const latSpread =
    Math.max(...pins.map((p) => p.lat)) - Math.min(...pins.map((p) => p.lat));
  if (latSpread > 1) return 8;
  if (latSpread > 0.1) return 11;
  return 14;
}

export function pinBounds(pins: Pin[]): [[number, number], [number, number]] | null {
  if (pins.length < 2) return null;
  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

// Day-fit camera parameters, shared by the MapLibre and Google renderers.
export const FIT_PADDING = 48;
export const FIT_MAX_ZOOM = 14;

export type FitPadding = { top: number; right: number; bottom: number; left: number };

// Mobile full-map: the stop carousel (+ day switcher and List/Map toggle) covers
// the bottom of the map, so a day fit keeps pins above it.
export function fitPadding(stripVisible: boolean): FitPadding {
  return stripVisible
    ? { top: 72, right: FIT_PADDING, bottom: 240, left: FIT_PADDING }
    : { top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: FIT_PADDING };
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
