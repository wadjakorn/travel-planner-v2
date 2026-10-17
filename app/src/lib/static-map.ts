import 'server-only';
// Geoapify Static Maps (OG image). Server-only key; the URL is fetched from
// opengraph-image.tsx and inlined as a data URI, so the key never reaches the
// browser. Without center/zoom the API fits the view to the markers.
const BASE = 'https://maps.geoapify.com/v1/staticmap';

// scaleFactor 2 doubles the pixels, which is how we reach the 1200x630 OG canvas.
export const OG_MAP_SIZE = { width: 600, height: 315, scale: 2 } as const;

// Capped purely to keep the image readable.
const MAX_MARKERS = 12;

export type LatLng = { lat: number; lng: number };

export type StaticMapOptions = {
  width?: number;
  height?: number;
  scale?: 1 | 2;
  /** `#RRGGBB` */
  markerColor?: string;
};

function isValidPoint(p: LatLng): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    // (0,0) is the classic "missing coords" sentinel — Null Island is never a
    // real itinerary stop.
    !(p.lat === 0 && p.lng === 0)
  );
}

/** Evenly sample down to `max` points, always keeping first and last. */
function sample(points: LatLng[], max: number): LatLng[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/**
 * Build a Geoapify Static Maps URL fitted to `points`.
 *
 * Returns null when there is no server key or no usable coordinate — callers
 * must treat a null as "render the non-map fallback", never as an error.
 */
export function buildStaticMapUrl(
  points: LatLng[],
  opts: StaticMapOptions = {},
): string | null {
  const key = process.env.GEOAPIFY_API_KEY ?? '';
  if (!key) return null;

  const usable = sample(points.filter(isValidPoint), MAX_MARKERS);
  if (usable.length === 0) return null;

  const {
    width = OG_MAP_SIZE.width,
    height = OG_MAP_SIZE.height,
    scale = OG_MAP_SIZE.scale,
    markerColor = '#e4572e',
  } = opts;

  const params = new URLSearchParams({
    style: 'osm-bright',
    width: String(width),
    height: String(height),
    scaleFactor: String(scale),
    format: 'png',
  });
  params.set(
    'marker',
    usable
      .map(
        (p) =>
          `lonlat:${p.lng.toFixed(5)},${p.lat.toFixed(5)};type:circle;color:${markerColor};size:small`,
      )
      .join('|'),
  );
  params.set('apiKey', key);
  return `${BASE}?${params}`;
}

/**
 * Fetch a static map and return it as a data URI, or null on any failure.
 * Never throws: an OG image must still render when the map provider is down or over quota.
 */
export async function fetchStaticMapDataUri(
  points: LatLng[],
  opts: StaticMapOptions = {},
): Promise<string | null> {
  const url = buildStaticMapUrl(points, opts);
  if (!url) return null;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      // Cached at the fetch layer too, so repeated OG revalidations for an
      // unchanged itinerary do not re-hit the provider.
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
