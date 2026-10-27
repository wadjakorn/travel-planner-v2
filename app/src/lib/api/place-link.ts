import 'server-only';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import type { PlaceInputExtras, PlaceNear } from '@/lib/api/place-input';
import { consumeRateLimitKey } from '@/lib/api/rate-limit';
import { isGmapsUrl, isShortLink, readGmapsLink, type GmapsLink } from '@/lib/places/gmaps-link';
import { searchPlaces } from '@/lib/places/search';
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

const MESSAGES: Record<PlaceLinkWarningCode, string> = {
  url_unsupported: 'googleMapsUrl is not a supported Google Maps link and was ignored.',
  url_unresolved: 'The Google Maps link could not be resolved to a location.',
  place_unresolved: 'The "query" search returned no match; the place was kept without coordinates.',
  coords_approx: 'Coordinates are approximate (map viewport or address lookup); send lat/lng to pin exactly.',
  coords_mismatch: 'lat/lng differ from the Google Maps link by more than 2 km; the link location was used.',
  lookup_skipped: 'A lookup was skipped (request budget, deadline or daily limit); send lat/lng or retry later.',
};

// The coords-bearing search hits for a query, or 'skipped' when the lookup
// never ran (budget/deadline/daily cap). Cached per query text; each place
// then picks the hit nearest its own `near` bias, so the cache is bias-agnostic.
type GeocodeResult = PlaceSuggestion[] | 'skipped';

export class LinkBudget {
  readonly signal: AbortSignal;
  readonly geocodeCache = new Map<string, Promise<GeocodeResult>>();
  private remaining: number;

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

  async takeGeocode(): Promise<boolean> {
    if (!this.take()) return false;
    try {
      const r = await this.consume(`geocode:${this.userId}`, GEOCODE_DAILY, 86_400);
      return r.ok;
    } catch {
      return true;
    }
  }
}

export type PlaceLinkDeps = { readLink?: typeof readGmapsLink; search?: typeof searchPlaces };

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

// Pick the geocode hit closest to the `near` bias, else the first. `hits` are
// already filtered to coords-bearing results, so lat/lng are non-null.
function pickNearest(hits: PlaceSuggestion[], near: PlaceNear | null): PlaceSuggestion | null {
  if (hits.length === 0) return null;
  if (!near) return hits[0];
  return hits.reduce((best, r) =>
    metres(near.lat, near.lng, r.lat!, r.lng!) < metres(near.lat, near.lng, best.lat!, best.lng!) ? r : best,
  );
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
  const search = deps.search ?? searchPlaces;
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
  let pending = budget.geocodeCache.get(q);
  if (!pending) {
    pending = (async (): Promise<GeocodeResult> =>
      (await budget.takeGeocode())
        ? (await search(q, { signal: budget.signal, skipGoogle: true })).filter((r) => r.lat !== null && r.lng !== null)
        : 'skipped')();
    budget.geocodeCache.set(q, pending);
  }
  const hits = await pending;
  const res = hits === 'skipped' ? null : pickNearest(hits, extra?.near ?? null);
  if (hits === 'skipped') {
    warn('lookup_skipped');
  } else if (res) {
    out.lat = res.lat;
    out.lng = res.lng;
    if (out.address === null) out.address = res.address;
    warn('coords_approx');
  } else if (budget.signal.aborted) {
    warn('lookup_skipped');
    budget.geocodeCache.delete(q);
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
