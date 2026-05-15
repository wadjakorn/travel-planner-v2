// Server-side Routes API (REST) client.
//
// Replaces the client-side `google.maps.routes.Route.computeRoutes()`
// (Maps JS v=alpha) which is Pre-GA and not in the official 2025 docs.
// Canonical 2025 pattern: POST https://routes.googleapis.com/directions/v2:computeRoutes
// with X-Goog-Api-Key + X-Goog-FieldMask. Key never leaves the server.
//
// Docs:
//   https://developers.google.com/maps/documentation/routes/compute_route_directions
//   https://developers.google.com/maps/documentation/routes/choose_fields
//   https://developers.google.com/maps/documentation/utilities/polylineutility

import 'server-only';

import type { RestTravelMode } from './map-helpers';
import { FEATURE_FLAGS } from './feature-flags';

const ROUTES_ENDPOINT =
  'https://routes.googleapis.com/directions/v2:computeRoutes';

// Field mask scoped to the minimum needed for rendering + persistence.
// Avoids `routes.travelAdvisory` which pushes into Advanced SKUs.
//
// DRIVE / WALK: route-level `routes.polyline.encodedPolyline` is populated.
// TRANSIT: route-level polyline is empty; the encoded polyline lives per-step
// at `routes.legs.steps.polyline.encodedPolyline` (Routes "Transit route"
// docs). We extend the mask only for TRANSIT to avoid Advanced SKU on the
// non-transit path.
const FIELD_MASK_BASE = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.legs.localizedValues',
].join(',');

const FIELD_MASK_TRANSIT = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.legs.localizedValues',
  'routes.legs.steps.polyline.encodedPolyline',
].join(',');

export type LatLng = { lat: number; lng: number };

export type ComputeRouteLegInput = {
  origin: LatLng;
  destination: LatLng;
  travelMode: RestTravelMode;
};

export type ComputeRouteLegResult = {
  distanceText: string;
  durationText: string;
  encodedPolyline: string;
};

type RoutesRestResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
    legs?: Array<{
      localizedValues?: {
        distance?: { text?: string };
        duration?: { text?: string };
        staticDuration?: { text?: string };
      };
      steps?: Array<{
        polyline?: { encodedPolyline?: string };
      }>;
    }>;
  }>;
  error?: { code?: number; message?: string; status?: string };
};

/**
 * Compute a single leg via the REST Routes API.
 * Returns null on any non-2xx, network error, or empty `routes` payload.
 * Caller renders a dashed fallback line on null.
 */
export async function computeRouteLeg({
  origin,
  destination,
  travelMode,
}: ComputeRouteLegInput): Promise<ComputeRouteLegResult | null> {
  // Short-circuit when flag off: skip API call entirely. Client falls back
  // to dashed straight line. Use to halt billing during dev.
  if (!FEATURE_FLAGS.routesApiEnabled) return null;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn('[routes-server] GOOGLE_MAPS_API_KEY not set');
    return null;
  }

  const body: Record<string, unknown> = {
    origin: {
      location: {
        latLng: { latitude: origin.lat, longitude: origin.lng },
      },
    },
    destination: {
      location: {
        latLng: { latitude: destination.lat, longitude: destination.lng },
      },
    },
    travelMode,
    polylineEncoding: 'ENCODED_POLYLINE',
    units: 'METRIC',
    languageCode: 'en',
  };

  // routingPreference is allowed only for DRIVE / TWO_WHEELER per REST docs.
  if (travelMode === 'DRIVE') {
    body.routingPreference = 'TRAFFIC_AWARE';
  }

  // TRANSIT requires a non-past departureTime (or arrivalTime). Stamp now.
  if (travelMode === 'TRANSIT') {
    body.departureTime = new Date(Date.now() + 60_000).toISOString();
  }

  const fieldMask =
    travelMode === 'TRANSIT' ? FIELD_MASK_TRANSIT : FIELD_MASK_BASE;

  let res: Response;
  try {
    res = await fetch(ROUTES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
      // Server-side fetch; no Next.js fetch cache (route freshness varies
      // per mode + time of day). Caller may add unstable_cache wrapper.
      cache: 'no-store',
    });
  } catch (err) {
    console.warn('[routes-server] network error', err);
    return null;
  }

  if (!res.ok) {
    // Read body for diagnostics but don't expose it to client.
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    console.warn(
      `[routes-server] HTTP ${res.status} ${res.statusText}`,
      detail.slice(0, 200),
    );
    return null;
  }

  let json: RoutesRestResponse;
  try {
    json = (await res.json()) as RoutesRestResponse;
  } catch (err) {
    console.warn('[routes-server] JSON parse failed', err);
    return null;
  }

  const route = json.routes?.[0];
  let encoded = route?.polyline?.encodedPolyline ?? '';

  // TRANSIT does not populate route-level polyline. Stitch step polylines
  // (one per walk/transit segment) into a single path so the client can
  // render one orange line per leg without changing its decode contract.
  if (!encoded && travelMode === 'TRANSIT') {
    const stepPolylines = (route?.legs ?? [])
      .flatMap((l) => l.steps ?? [])
      .map((s) => s.polyline?.encodedPolyline)
      .filter((p): p is string => !!p);
    if (stepPolylines.length > 0) {
      const path = stepPolylines.flatMap((p) => decodePolyline(p));
      if (path.length > 0) encoded = encodePolyline(path);
    }
  }

  if (!route || !encoded) return null;

  const localized = route.legs?.[0]?.localizedValues;
  const distanceText = localized?.distance?.text ?? '';
  const durationText =
    localized?.staticDuration?.text ?? localized?.duration?.text ?? '';

  if (!distanceText || !durationText) {
    // Persistence layer needs both texts; partial responses fall back.
    return null;
  }

  return {
    distanceText,
    durationText,
    encodedPolyline: encoded,
  };
}

// Google Encoded Polyline Algorithm Format (precision 5).
// https://developers.google.com/maps/documentation/utilities/polylinealgorithm
// Self-contained to avoid a runtime dep just for transit step stitching.

function decodePolyline(encoded: string): LatLng[] {
  const path: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = encoded.length;
  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    path.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return path;
}

function encodePolyline(path: LatLng[]): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const { lat, lng } of path) {
    const ilat = Math.round(lat * 1e5);
    const ilng = Math.round(lng * 1e5);
    out += encodeSignedNumber(ilat - prevLat);
    out += encodeSignedNumber(ilng - prevLng);
    prevLat = ilat;
    prevLng = ilng;
  }
  return out;
}

function encodeSignedNumber(num: number): string {
  let sgn = num << 1;
  if (num < 0) sgn = ~sgn;
  let out = '';
  while (sgn >= 0x20) {
    out += String.fromCharCode((0x20 | (sgn & 0x1f)) + 63);
    sgn >>>= 5;
  }
  out += String.fromCharCode(sgn + 63);
  return out;
}
