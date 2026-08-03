// Google Static Maps URL builder (Maps #5).
//
// Static Maps is a *server-side* SKU ($2/1k, own 10k/month free tier). The key
// used here is the server-only GOOGLE_MAPS_API_KEY — never the NEXT_PUBLIC one,
// and the URL is only ever fetched from the server (see opengraph-image.tsx),
// so neither key nor signature reaches the browser.
//
// If GOOGLE_MAPS_URL_SIGNING_SECRET is set, URLs are signed per
// https://developers.google.com/maps/documentation/maps-static/digital-signature

import crypto from 'node:crypto';

const BASE_PATH = '/maps/api/staticmap';
const BASE_HOST = 'https://maps.googleapis.com';

// Static Maps caps at 640x640 per axis; scale=2 doubles the pixels for the
// same SKU cost, which is how we reach the 1200x630 OG canvas.
export const OG_MAP_SIZE = { width: 600, height: 315, scale: 2 } as const;

// Google's URL length limit is 16,384 chars, but each extra marker also costs
// nothing — we cap purely to keep the image readable.
const MAX_MARKERS = 12;

export type LatLng = { lat: number; lng: number };

export type StaticMapOptions = {
  width?: number;
  height?: number;
  scale?: 1 | 2;
  /** Marker colour as a Static Maps colour (`0xRRGGBB` or a named colour). */
  markerColor?: string;
  mapType?: 'roadmap' | 'terrain';
};

function serverKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? '';
}

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

function sign(pathWithQuery: string, secret: string): string {
  const key = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return crypto
    .createHmac('sha1', key)
    .update(pathWithQuery)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Build a Static Maps URL fitted to `points`.
 *
 * Returns null when there is no server key or no usable coordinate — callers
 * must treat a null as "render the non-map fallback", never as an error.
 */
export function buildStaticMapUrl(
  points: LatLng[],
  opts: StaticMapOptions = {},
): string | null {
  const key = serverKey();
  if (!key) return null;

  const usable = sample(points.filter(isValidPoint), MAX_MARKERS);
  if (usable.length === 0) return null;

  const {
    width = OG_MAP_SIZE.width,
    height = OG_MAP_SIZE.height,
    scale = OG_MAP_SIZE.scale,
    markerColor = '0xE4572E',
    mapType = 'roadmap',
  } = opts;

  const params = new URLSearchParams();
  params.set('size', `${width}x${height}`);
  params.set('scale', String(scale));
  params.set('maptype', mapType);
  params.set('format', 'png');
  // No center/zoom: Static Maps auto-fits the viewport to the markers.
  params.set(
    'markers',
    `size:mid|color:${markerColor}|${usable
      .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
      .join('|')}`,
  );
  params.set('key', key);

  let pathWithQuery = `${BASE_PATH}?${params.toString()}`;

  const secret = process.env.GOOGLE_MAPS_URL_SIGNING_SECRET;
  if (secret) {
    pathWithQuery += `&signature=${sign(pathWithQuery, secret)}`;
  }

  return `${BASE_HOST}${pathWithQuery}`;
}

/**
 * Fetch a static map and return it as a data URI, or null on any failure.
 * Never throws: an OG image must still render when Maps is down or over quota.
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
      // unchanged itinerary do not re-bill the Static Maps SKU.
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
