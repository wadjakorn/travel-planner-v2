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

const ROUTES_ENDPOINT =
  'https://routes.googleapis.com/directions/v2:computeRoutes';

// Field mask scoped to the minimum needed for rendering + persistence.
// Avoids `routes.travelAdvisory` and `legs.steps.*` which push into
// Advanced SKUs.
const FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.legs.localizedValues',
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

  let res: Response;
  try {
    res = await fetch(ROUTES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
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
  const encoded = route?.polyline?.encodedPolyline;
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
