import 'server-only';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import type { PlaceInputExtras, PlaceNear } from '@/lib/api/place-input';
import { consumeRateLimitKey } from '@/lib/api/rate-limit';
import { MAX_BIAS_RADIUS_M, type Bias } from '@/lib/places/bias';
import { isGmapsUrl, isShortLink, readGmapsLink, type GmapsLink } from '@/lib/places/gmaps-link';
import { searchPlaces } from '@/lib/places/search';
import {
  PLACES_SEARCH_DAILY_CAP,
  placesSearchBucket,
  placesSearchConfigured,
  searchPlacesByText,
} from '@/lib/places/text-search';
import type { PlaceSuggestion } from '@/lib/places/types';
import type { PlaceFields } from '@/lib/services/place-service';

export type PlaceLinkWarningCode =
  | 'url_unsupported'
  | 'url_unresolved'
  | 'place_unresolved'
  | 'coords_approx'
  | 'coords_mismatch'
  | 'lookup_skipped';
export type PlaceLinkWarning = { code: PlaceLinkWarningCode; message: string };

export const API_LINK_LOOKUPS = 50;
export const API_LINK_DEADLINE_MS = 20_000;
export const GEOCODE_DAILY = 300;
const MISMATCH_METRES = 2000;
// Per-call cap on one Google Text Search inside the shared 20 s deadline; a
// slow call falls back to Geoapify/Photon instead of eating the whole budget.
const TEXT_SEARCH_TIMEOUT_MS = 3000;

const MESSAGES: Record<PlaceLinkWarningCode, string> = {
  url_unsupported: 'googleMapsUrl is not a supported Google Maps link and was ignored.',
  url_unresolved: 'The Google Maps link could not be resolved to a location.',
  place_unresolved: 'The "query" search returned no match; the place was kept without coordinates.',
  coords_approx: 'Coordinates are approximate (map viewport or address lookup); send lat/lng to pin exactly.',
  coords_mismatch: 'lat/lng differ from the Google Maps link by more than 2 km; the link location was used.',
  lookup_skipped: 'A lookup was skipped (request budget, deadline or daily limit); send lat/lng or retry later.',
};

// One coords-bearing hit. `placeId` is set only for Google Text Search hits.
type Hit = { lat: number; lng: number; address: string | null; placeId: string | null };
// The hits for a query, or 'skipped' when the lookup never ran
// (budget/deadline/daily cap). `exact`: Google Text Search hits (exact coords,
// relevance-ranked with `near` as locationBias -> take the first); otherwise
// Geoapify/Photon hits (approximate -> pick the one nearest `near`). Cached
// per query text + near (near now shapes the search itself, TP-0140).
type GeocodeResult = { exact: boolean; hits: Hit[] } | 'skipped';

export class LinkBudget {
  readonly signal: AbortSignal;
  readonly geocodeCache = new Map<string, Promise<GeocodeResult>>();
  private remaining: number;
  // Latched for the rest of this import once the places:search quota is spent
  // or Google errors, so later places go straight to the fallback.
  googleOff = false;

  constructor(
    private readonly userId: string,
    lookups: number = API_LINK_LOOKUPS,
    deadlineMs: number = API_LINK_DEADLINE_MS,
    private readonly consume: typeof consumeRateLimitKey = consumeRateLimitKey,
  ) {
    this.remaining = lookups;
    this.signal = AbortSignal.timeout(deadlineMs);
  }

  take(): boolean {
    if (this.signal.aborted || this.remaining <= 0) return false;
    this.remaining -= 1;
    return true;
  }

  /** One unit of a per-user daily bucket. Fails open when the limiter throws. */
  private async daily(bucket: string, max: number): Promise<boolean> {
    try {
      return (await this.consume(bucket, max, 86_400)).ok;
    } catch {
      return true;
    }
  }

  /** Geoapify/Photon fallback geocode: the import geocode bucket. */
  consumeGeocode(): Promise<boolean> {
    return this.daily(`geocode:${this.userId}`, GEOCODE_DAILY);
  }

  /** Google Text Search: the SAME bucket as GET /api/v1/places/search. */
  consumeSearch(): Promise<boolean> {
    return this.daily(placesSearchBucket(this.userId), PLACES_SEARCH_DAILY_CAP);
  }
}

export type PlaceLinkDeps = {
  readLink?: typeof readGmapsLink;
  search?: typeof searchPlaces;
  // Google Text Search. undefined -> searchPlacesByText when
  // GOOGLE_PLACES_SERVER_KEY is set; null -> never (keyless fallback only).
  textSearch?: typeof searchPlacesByText | null;
};

function metres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isShort(url: string): boolean {
  try {
    return isShortLink(new URL(url));
  } catch {
    return false;
  }
}

// Pick the geocode hit closest to the `near` bias, else the first.
function pickNearest(hits: Hit[], near: PlaceNear | null): Hit | null {
  if (hits.length === 0) return null;
  if (!near) return hits[0];
  return hits.reduce((best, r) =>
    metres(near.lat, near.lng, r.lat, r.lng) < metres(near.lat, near.lng, best.lat, best.lng) ? r : best,
  );
}

const fromSuggestion = (r: PlaceSuggestion): Hit => ({ lat: r.lat!, lng: r.lng!, address: r.address, placeId: null });

// One lookup = one unit of the per-import LinkBudget. Google Text Search
// (near as locationBias, places:search bucket) when the server key is set;
// Geoapify/Photon (near as a real bias, geocode bucket) when the key is
// missing, the quota is spent, or Google errors (TP-0140).
async function lookup(
  q: string,
  near: PlaceNear | null,
  budget: LinkBudget,
  deps: PlaceLinkDeps,
): Promise<GeocodeResult> {
  if (!budget.take()) return 'skipped';
  const textSearch =
    deps.textSearch === undefined ? (placesSearchConfigured() ? searchPlacesByText : null) : deps.textSearch;
  if (textSearch && !budget.googleOff) {
    if (await budget.consumeSearch()) {
      try {
        const signal = AbortSignal.any([budget.signal, AbortSignal.timeout(TEXT_SEARCH_TIMEOUT_MS)]);
        const hits = await textSearch(q, { near }, { signal });
        return { exact: true, hits: hits.map((h) => ({ lat: h.lat, lng: h.lng, address: h.address, placeId: h.placeId })) };
      } catch {
        // Past the deadline the caller reports lookup_skipped; otherwise fall back.
        if (budget.signal.aborted) return { exact: true, hits: [] };
        budget.googleOff = true;
      }
    } else {
      budget.googleOff = true;
    }
  }
  if (!(await budget.consumeGeocode())) return 'skipped';
  const bias: Bias | null = near ? { kind: 'point', lat: near.lat, lng: near.lng, radius: MAX_BIAS_RADIUS_M } : null;
  const res = await search(q, { signal: budget.signal, skipGoogle: true, bias }, deps);
  return { exact: false, hits: res };
}

async function search(
  q: string,
  opts: { signal: AbortSignal; skipGoogle: true; bias: Bias | null },
  deps: PlaceLinkDeps,
): Promise<Hit[]> {
  const res = await (deps.search ?? searchPlaces)(q, opts);
  return res.filter((r) => r.lat !== null && r.lng !== null).map(fromSuggestion);
}

// The query/near resolve slots parsed by readPlaceExtras (P0-CONTRACT), wired
// into the existing geocode machinery by TP-0039.
export type PlaceLinkExtras = Pick<PlaceInputExtras, 'query' | 'near'>;

export async function applyPlaceLink(
  fields: PlaceFields,
  url: string | null,
  budget: LinkBudget,
  deps: PlaceLinkDeps = {},
  extra: PlaceLinkExtras | null = null,
): Promise<{ fields: PlaceFields; warnings: PlaceLinkWarning[] }> {
  const readLink = deps.readLink ?? readGmapsLink;
  const out: PlaceFields = { ...fields };
  const warnings: PlaceLinkWarning[] = [];
  const warn = (code: PlaceLinkWarningCode) => {
    if (!warnings.some((w) => w.code === code)) warnings.push({ code, message: MESSAGES[code] });
  };

  let link: GmapsLink | null = null;
  let linkSent = false;
  if (url !== null) {
    if (!isGmapsUrl(url)) {
      warn('url_unsupported');
    } else if (isShort(url) && !budget.take()) {
      warn('lookup_skipped');
    } else {
      linkSent = true;
      link = await readLink(url, { signal: budget.signal });
      if (!link) warn(budget.signal.aborted ? 'lookup_skipped' : 'url_unresolved');
    }
  }

  if (!out.placeIdExternal && link) {
    out.placeIdExternal = link.cid ? `gcid:${link.cid}` : link.googlePlaceId;
  }

  const agentHasCoords = fields.lat !== null && fields.lng !== null;
  const linkHasCoords = !!link && link.lat !== null && link.lng !== null;
  if (link && linkHasCoords && link.precision === 'exact') {
    if (agentHasCoords && metres(fields.lat!, fields.lng!, link.lat!, link.lng!) > MISMATCH_METRES) {
      warn('coords_mismatch');
    }
    out.lat = link.lat;
    out.lng = link.lng;
  } else if (!agentHasCoords && link && linkHasCoords && link.precision === 'viewport') {
    out.lat = link.lat;
    out.lng = link.lng;
    warn('coords_approx');
  }

  // A place can be geocoded when a link was sent, an address exists, or the
  // caller supplied an explicit `query` to resolve (TP-0039). `query` is the
  // user's search intent, so it outranks the name/address fallback.
  const query = extra?.query ?? null;
  const hasCoords = out.lat !== null && out.lng !== null;
  if (hasCoords || out.kind === 'transit' || (!linkSent && out.address === null && query === null)) {
    return { fields: out, warnings };
  }

  const q = link?.query ?? link?.name ?? query ?? [out.name, out.address].filter(Boolean).join(', ');
  const near = extra?.near ?? null;
  // ~100 m grid: nearby biases share a lookup, distant ones do not.
  const cacheKey = near ? `${q}\u0000${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : q;
  let pending = budget.geocodeCache.get(cacheKey);
  if (!pending) {
    pending = lookup(q, near, budget, deps);
    budget.geocodeCache.set(cacheKey, pending);
  }
  const result = await pending;
  const res =
    result === 'skipped' ? null : result.exact ? (result.hits[0] ?? null) : pickNearest(result.hits, near);
  if (result === 'skipped') {
    warn('lookup_skipped');
  } else if (res) {
    out.lat = res.lat;
    out.lng = res.lng;
    if (out.address === null) out.address = res.address;
    if (!out.placeIdExternal && res.placeId) out.placeIdExternal = res.placeId;
    // Text Search coords are the place's own; geocoder hits are approximate.
    if (!result.exact) warn('coords_approx');
  } else if (budget.signal.aborted) {
    warn('lookup_skipped');
    budget.geocodeCache.delete(cacheKey);
  } else if (linkSent) {
    warn('url_unresolved');
  } else {
    // The lookup ran and returned nothing (not a link, not a budget/deadline
    // skip): a genuinely unresolved query/address. Distinct from url_unresolved.
    warn('place_unresolved');
  }
  return { fields: out, warnings };
}

export type PlanLinkWarning = PlaceLinkWarning & { day: number; place: number };

const PLAN_CONCURRENCY = 5;

export async function resolvePlanLinks(
  userId: string,
  plan: ParsedImportPlan,
  links: (string | null)[][],
  deps: PlaceLinkDeps & { budget?: LinkBudget } = {},
  extras: PlaceLinkExtras[][] = [],
): Promise<{ plan: ParsedImportPlan; warnings: PlanLinkWarning[] }> {
  const budget = deps.budget ?? new LinkBudget(userId);
  const days = plan.days.map((d) => ({ ...d, places: [...d.places] }));
  const results = new Map<string, PlaceLinkWarning[]>();

  const jobs: { di: number; pi: number; url: string | null; extra: PlaceLinkExtras | null }[] = [];
  plan.days.forEach((d, di) =>
    d.places.forEach((p, pi) => {
      const url = links[di]?.[pi] ?? null;
      const extra = extras[di]?.[pi] ?? null;
      // A `query` makes a place geocodable even with no address (TP-0039).
      const geocodable =
        p.lat === null &&
        p.lng === null &&
        p.kind !== 'transit' &&
        (p.address !== null || extra?.query != null);
      if (url !== null || geocodable) jobs.push({ di, pi, url, extra });
    }),
  );

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { di, pi, url, extra } = jobs[next++];
      const r = await applyPlaceLink(plan.days[di].places[pi], url, budget, deps, extra);
      days[di].places[pi] = r.fields;
      results.set(`${di}:${pi}`, r.warnings);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PLAN_CONCURRENCY, jobs.length) }, worker));

  const warnings: PlanLinkWarning[] = [];
  plan.days.forEach((d, di) =>
    d.places.forEach((_, pi) => {
      for (const w of results.get(`${di}:${pi}`) ?? []) warnings.push({ ...w, day: di + 1, place: pi + 1 });
    }),
  );
  return { plan: { ...plan, days }, warnings };
}
