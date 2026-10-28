import 'server-only';
import { GoogleHttpError } from './google';

// Server-side Google Places (New) Text Search, keyed by name (TP-0038).
//
// Kept as a standalone service — not inlined in the route — so it can be reused
// later as the MCP `search_places` tool (TP-0035/EVG) without an HTTP hop.
//
// Uses its OWN key (`GOOGLE_PLACES_SERVER_KEY`), separate from the restricted
// `GOOGLE_MAPS_API_KEY` used by the maps/autocomplete paths.

const BASE = 'https://places.googleapis.com/v1';

// Minimal field mask: Text Search Pro tier only. Do NOT add Atmosphere /
// Enterprise fields (rating, reviews, opening hours, photos) — any of them in
// the terminating call jumps the SKU tier and bills more.
export const TEXT_SEARCH_MASK =
  'places.id,places.displayName,places.location,places.formattedAddress,places.types';

// Cap results to a sane N; also the Google `pageSize`.
export const TEXT_SEARCH_LIMIT = 10;

// Default location-bias radius (metres) when `near` is given without a radius,
// and the hard ceiling Google accepts for a circular bias.
const MAX_RADIUS_M = 50_000;

export type Near = { lat: number; lng: number };

export type TextSearchResult = {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  types?: string[];
};

/** Thrown when `GOOGLE_PLACES_SERVER_KEY` is unset — the route maps it to 503. */
export class PlacesSearchUnavailableError extends Error {
  constructor(message = 'Places search is not configured') {
    super(message);
    this.name = 'PlacesSearchUnavailableError';
  }
}

type Deps = {
  key?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
};

/**
 * Search Google Places by free text. Returns up to TEXT_SEARCH_LIMIT located
 * results. Throws PlacesSearchUnavailableError when no key is configured, and
 * GoogleHttpError on a network/timeout/non-2xx failure.
 */
export async function searchPlacesByText(
  q: string,
  opts: { near?: Near | null; radius?: number | null } = {},
  deps: Deps = {},
): Promise<TextSearchResult[]> {
  const query = q.trim();
  if (!query) return [];

  const key = deps.key ?? process.env.GOOGLE_PLACES_SERVER_KEY?.trim() ?? '';
  if (!key) throw new PlacesSearchUnavailableError();

  const fetchImpl = deps.fetchImpl ?? fetch;

  const body: Record<string, unknown> = { textQuery: query, pageSize: TEXT_SEARCH_LIMIT };
  if (opts.near) {
    const radius = opts.radius && opts.radius > 0 ? Math.min(opts.radius, MAX_RADIUS_M) : MAX_RADIUS_M;
    body.locationBias = {
      circle: { center: { latitude: opts.near.lat, longitude: opts.near.lng }, radius },
    };
  }

  let res: Response;
  try {
    res = await fetchImpl(`${BASE}/places:searchText`, {
      method: 'POST',
      // Google ToS: never cache raw Places responses.
      cache: 'no-store',
      signal: deps.signal ?? AbortSignal.timeout(deps.timeoutMs ?? 3000),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': TEXT_SEARCH_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new GoogleHttpError(0, e instanceof Error ? e.message : 'network error');
  }
  if (!res.ok) throw new GoogleHttpError(res.status);

  let json: { places?: RawPlace[] };
  try {
    json = (await res.json()) as { places?: RawPlace[] };
  } catch (e) {
    throw new GoogleHttpError(0, e instanceof Error ? e.message : 'bad json');
  }

  const out: TextSearchResult[] = [];
  for (const p of json.places ?? []) {
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (!p.id || typeof lat !== 'number' || typeof lng !== 'number') continue;
    out.push({
      placeId: p.id,
      name: p.displayName?.text ?? '',
      lat,
      lng,
      address: p.formattedAddress ?? null,
      ...(p.types && p.types.length ? { types: p.types } : {}),
    });
    if (out.length >= TEXT_SEARCH_LIMIT) break;
  }
  return out;
}
