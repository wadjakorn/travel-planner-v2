import type { CSSProperties } from 'react';
import { LEG_COLORS, type LatLng, type MapLeg, type Mode, type Pin } from './map-helpers';
import { metersBetween } from './map-preview';

// Pure rules for the day route lines (components/map-route-*.tsx), shared by
// the Google and MapLibre renderers. One curved arc per leg, in its leg colour,
// drawn from stored coords: no Routes/Directions call.

export const ROUTE_WIDTH = 3;
export const ROUTE_OPACITY = 0.9;
export const CASING_WIDTH = 6;
export const CASING_OPACITY = 0.9;

/** Control-point offset from the chord midpoint, as a fraction of |AB|. */
export const ARC_BEND = 0.18;
export const ARC_SEGMENTS = 32;
/** Legs shorter than this get no mode badge (it would cover both pins). */
export const ARC_BADGE_MIN_M = 300;

/** Below this, a leg's ends are the same spot (same hotel morning and night,
 *  duplicates): drawing it would leave a stray blob of line on the pin. */
export const MIN_LEG_METERS = 10;

type MaybeLocated = { lat?: number | null; lng?: number | null };

/**
 * The leg's colour slot, or null when the map draws no line for it. `i` is the
 * leg's display index (it joins display places i and i+1), never a segment's
 * `idx`, so the list and the map agree. Shared by both.
 */
export function legSlot(i: number, a: MaybeLocated, b?: MaybeLocated | null): number | null {
  if (a.lat == null || a.lng == null || b?.lat == null || b.lng == null) return null;
  const from = { lat: a.lat, lng: a.lng };
  const to = { lat: b.lat, lng: b.lng };
  if (metersBetween(from, to) < MIN_LEG_METERS) return null;
  return i % LEG_COLORS.length;
}

/** The theme-aware token for a slot, set on the list's leg row. */
export function legStyle(slot: number): CSSProperties {
  return { '--leg': `var(--leg-${slot + 1})` } as CSSProperties;
}

type XY = { x: number; y: number };

const RAD = Math.PI / 180;

// Web-Mercator, so the bend looks the same at any latitude (y north-up).
const project = (p: LatLng): XY => ({ x: p.lng * RAD, y: Math.log(Math.tan(Math.PI / 4 + (p.lat * RAD) / 2)) });
const unproject = ({ x, y }: XY): LatLng => ({
  lat: (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD,
  lng: x / RAD,
});

/** B with its longitude moved within ±180° of A's, so the arc takes the short way. */
function nearB(a: LatLng, b: LatLng): LatLng {
  return { lat: b.lat, lng: b.lng + 360 * Math.round((a.lng - b.lng) / 360) };
}

// Quadratic Bézier A → C → B; C is the chord midpoint pushed left of travel by
// ARC_BEND·|AB|, so A→B and B→A curve apart. null = zero-length leg.
function bezier(a: LatLng, b: LatLng): ((t: number) => LatLng) | null {
  const pa = project(a);
  const pb = project(nearB(a, b));
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  if (dx === 0 && dy === 0) return null;
  const c = { x: (pa.x + pb.x) / 2 - ARC_BEND * dy, y: (pa.y + pb.y) / 2 + ARC_BEND * dx };
  return (t) => {
    const u = 1 - t;
    return unproject({
      x: u * u * pa.x + 2 * u * t * c.x + t * t * pb.x,
      y: u * u * pa.y + 2 * u * t * c.y + t * t * pb.y,
    });
  };
}

/**
 * ARC_SEGMENTS + 1 points from a to b, bending left. Longitudes stay unwrapped
 * (MapLibre needs the continuity; Google's LatLngLiteral wraps them itself).
 */
export function arcPath(a: LatLng, b: LatLng): LatLng[] {
  const at = bezier(a, b);
  const end = { lat: b.lat, lng: nearB(a, b).lng };
  if (!at) return [{ lat: a.lat, lng: a.lng }, end];
  const out: LatLng[] = [{ lat: a.lat, lng: a.lng }];
  for (let i = 1; i < ARC_SEGMENTS; i++) out.push(at(i / ARC_SEGMENTS));
  out.push(end);
  return out;
}

/** The arc's t=0.5 point, where the mode badge sits. */
export function arcMid(a: LatLng, b: LatLng): LatLng {
  return bezier(a, b)?.(0.5) ?? { lat: a.lat, lng: a.lng };
}

export type RouteArc = { key: string; path: LatLng[]; mid: LatLng; mode: Mode | null; showBadge: boolean; color: string };

/** One arc per leg (keyed by pin ids); a leg whose pin is missing is skipped. */
export function routeArcs(pins: Pin[], legs: MapLeg[]): RouteArc[] {
  const out: RouteArc[] = [];
  for (const leg of legs) {
    const a = pins[leg.from];
    const b = pins[leg.to];
    if (!a || !b) continue;
    out.push({
      key: `${a.id}>${b.id}`,
      path: arcPath(a, b),
      mid: arcMid(a, b),
      mode: leg.mode,
      showBadge: leg.mode !== null && metersBetween(a, b) >= ARC_BADGE_MIN_M,
      color: LEG_COLORS[leg.slot],
    });
  }
  return out;
}

export type RouteFeature = {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: { key: string; color: string };
};
export type RouteFeatureCollection = { type: 'FeatureCollection'; features: RouteFeature[] };

/** MapLibre source data: one [lng, lat] LineString per arc. */
export function legsGeoJSON(arcs: RouteArc[]): RouteFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: arcs.map((arc) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: arc.path.map((p): [number, number] => [p.lng, p.lat]) },
      properties: { key: arc.key, color: arc.color },
    })),
  };
}
