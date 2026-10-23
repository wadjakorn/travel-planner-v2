import 'server-only';
// Static map for the OG image, switched by MapsConfig.staticMap: signed Google
// Static Maps (server key + signing secret) or Geoapify. Server-only keys; the
// URL is fetched from opengraph-image.tsx and inlined as a data URI, so no key
// reaches the browser. Without center/zoom both APIs fit the view to the markers.
import crypto from 'node:crypto';
import { MAPS_CONFIG, type MapsConfig } from './maps/config';

const BASE = 'https://maps.geoapify.com/v1/staticmap';
const GOOGLE_HOST = 'https://maps.googleapis.com';
const GOOGLE_PATH = '/maps/api/staticmap';

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

// https://developers.google.com/maps/documentation/maps-static/digital-signature
function sign(pathWithQuery: string, secret: string): string {
  const key = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return crypto
    .createHmac('sha1', key)
    .update(pathWithQuery)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function buildGoogleUrl(
  points: LatLng[],
  opts: StaticMapOptions,
  cfg: MapsConfig,
): string | null {
  const { serverKey, signingSecret } = cfg.google;
  if (!serverKey || !signingSecret) return null;

  const usable = sample(points.filter(isValidPoint), MAX_MARKERS);
  if (usable.length === 0) return null;

  const {
    width = OG_MAP_SIZE.width,
    height = OG_MAP_SIZE.height,
    scale = OG_MAP_SIZE.scale,
    markerColor = '#e4572e',
  } = opts;

  const params = new URLSearchParams();
  params.set('size', `${width}x${height}`);
  params.set('scale', String(scale));
  params.set('maptype', 'roadmap');
  params.set('format', 'png');
  // No center/zoom: Static Maps auto-fits the viewport to the markers.
  params.set(
    'markers',
    `size:mid|color:0x${markerColor.replace(/^#/, '').toUpperCase()}|${usable
      .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
      .join('|')}`,
  );
  params.set('key', serverKey);

  const pathWithQuery = `${GOOGLE_PATH}?${params.toString()}`;
  return `${GOOGLE_HOST}${pathWithQuery}&signature=${sign(pathWithQuery, signingSecret)}`;
}

function buildGeoapifyUrl(
  points: LatLng[],
  opts: StaticMapOptions,
  cfg: MapsConfig,
): string | null {
  const key = cfg.geoapifyKey;
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
 * Build a static map URL fitted to `points` for the configured provider.
 *
 * Returns null when no provider is usable or there is no usable coordinate —
 * callers must treat a null as "render the non-map fallback", never as an error.
 */
export function buildStaticMapUrl(
  points: LatLng[],
  opts: StaticMapOptions = {},
  cfg: MapsConfig = MAPS_CONFIG,
): string | null {
  if (cfg.staticMap === 'google') return buildGoogleUrl(points, opts, cfg);
  if (cfg.staticMap === 'geoapify') return buildGeoapifyUrl(points, opts, cfg);
  return null;
}

/**
 * Fetch a static map and return it as a data URI, or null on any failure.
 * Never throws: an OG image must still render when the map provider is down or over quota.
 */
export async function fetchStaticMapDataUri(
  points: LatLng[],
  opts: StaticMapOptions = {},
  cfg: MapsConfig = MAPS_CONFIG,
): Promise<string | null> {
  const url = buildStaticMapUrl(points, opts, cfg);
  if (!url) return null;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      // Cached at the fetch layer too, so repeated OG revalidations for an
      // unchanged itinerary do not re-hit the provider. Google uses a daily
      // revalidate (not no-store, which would make the OG route dynamic).
      next: { revalidate: cfg.staticMap === 'google' ? 86400 : 60 * 60 * 24 * 7 },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
