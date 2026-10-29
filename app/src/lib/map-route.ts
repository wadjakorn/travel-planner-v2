import { MODE_COLOR, ROUTE_NONE_COLOR, type MapLeg, type Mode, type Pin } from './map-helpers';

// Pure rules for the day route lines (components/map-route-*.tsx), shared by
// the Google and MapLibre renderers. Straight lines between stored coords: no
// Routes/Directions call.

export const ROUTE_WIDTH = 3;
export const CASING_WIDTH = 7;
export const CASING_OPACITY = 0.9;

export type RouteMode = Mode | 'none';
export type RouteStyle = { color: string; dash: [number, number] | null };

/** Color + dash pattern (dash/gap in multiples of the line width; null = solid). */
export function routeStyle(mode: Mode | null): RouteStyle {
  switch (mode) {
    case 'walk':
      return { color: MODE_COLOR.walk, dash: [2, 6] };
    case 'drive':
      return { color: MODE_COLOR.drive, dash: [6, 4] };
    case 'transit':
      return { color: MODE_COLOR.transit, dash: null };
    default:
      return { color: ROUTE_NONE_COLOR, dash: [1, 3] };
  }
}

/** Google draws dashes as a repeated symbol: 'M 0,-1 0,1' at `scale` is 2*scale px long. */
export function googleDash(
  s: RouteStyle,
  width = ROUTE_WIDTH,
): { scale: number; repeatPx: number } | null {
  if (!s.dash) return null;
  const [dash, gap] = s.dash;
  return { scale: (dash * width) / 2, repeatPx: (dash + gap) * width };
}

export type RouteFeature = {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: { mode: RouteMode; color: string };
};
export type RouteFeatureCollection = { type: 'FeatureCollection'; features: RouteFeature[] };

/** One LineString per leg ([lng, lat]); a leg whose pin is missing is skipped. */
export function legsGeoJSON(pins: Pin[], legs: MapLeg[]): RouteFeatureCollection {
  const features: RouteFeature[] = [];
  for (const leg of legs) {
    const a = pins[leg.from];
    const b = pins[leg.to];
    if (!a || !b) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      properties: { mode: leg.mode ?? 'none', color: routeStyle(leg.mode).color },
    });
  }
  return { type: 'FeatureCollection', features };
}

// MapLibre arrow icons: one image per mode, re-added when a style swap drops them.
export const ARROW_SIZE = 24;
export const ROUTE_MODES: readonly RouteMode[] = ['walk', 'drive', 'transit', 'none'];
const ARROW_PREFIX = 'tp-route-arrow-';

export function arrowImageId(mode: RouteMode): string {
  return `${ARROW_PREFIX}${mode}`;
}

export function modeFromArrowImageId(id: string): RouteMode | null {
  if (!id.startsWith(ARROW_PREFIX)) return null;
  const m = id.slice(ARROW_PREFIX.length) as RouteMode;
  return ROUTE_MODES.includes(m) ? m : null;
}

/**
 * RGBA, east-pointing filled triangle in `hex` with a white rim (so the arrow
 * reads on a line of its own color), transparent elsewhere.
 */
export function arrowBitmap(size: number, hex: string): { width: number; height: number; data: Uint8Array } {
  const fill = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const tri: [number, number][] = [
    [size * 0.25, size * 0.2],
    [size * 0.8, size / 2],
    [size * 0.25, size * 0.8],
  ];
  const gx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
  const gy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
  const rim = tri.map(([x, y]): [number, number] => [gx + (x - gx) * 1.4, gy + (y - gy) * 1.4]);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const rgb = inTriangle(px, py, tri) ? fill : inTriangle(px, py, rim) ? [255, 255, 255] : null;
      if (!rgb) continue;
      const o = (y * size + x) * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

function inTriangle(px: number, py: number, [a, b, c]: [number, number][]): boolean {
  const side = (p: [number, number], q: [number, number]) =>
    (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0]);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
}
