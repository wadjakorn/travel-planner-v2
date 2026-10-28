import 'server-only';
import { consumeRateLimitKey } from '@/lib/api/rate-limit';
import { MAPS_CONFIG, readMapsConfig, type MapsConfig } from '@/lib/maps/config';
import { geoapifyAutocomplete, geoapifyDetails } from './geoapify';
import type { Bias } from './bias';
import { readGmapsLink } from './gmaps-link';
import { GoogleHttpError, googleAutocomplete, googleDetails, googlePhotoUri, isValidGoogleId, isValidPhotoName } from './google';
import { fakeGoogleFetch } from './google-fake';
import { queryLang } from './lang';
import { photonSearch } from './photon';
import { placeProvider } from './place-id';
import type { Consume } from './rate-limit';
import { timeZoneAt } from './tz-lookup';
import type { Fields, LinkSuggestions, PlaceDetail, PlaceSuggestion } from './types';

type Deps = {
  key?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  // Skip Google even in google mode: its suggestions carry no coordinates.
  skipGoogle?: boolean;
  config?: MapsConfig;
  session?: string | null;
  fields?: Fields;
  consume?: Consume;
  now?: () => number;
  bias?: Bias | null;
};

const BREAKER_MS = 600_000;
const DAY = 86400;
// Per-instance, in-memory state.
let trippedUntil = 0;
let budgetExhaustedUntil = 0;

/** Test-only: clears the breaker and the budget-exhausted state. */
export function __resetGoogleState(): void {
  trippedUntil = 0;
  budgetExhaustedUntil = 0;
}

export function googleBreakerOpen(now: number): boolean {
  return now < trippedUntil;
}

/** Trips the breaker for a timeout/network error (0), 403 or 429. Returns whether it tripped. */
export function noteGoogleFailure(err: unknown, now: number): boolean {
  const status = err instanceof GoogleHttpError ? err.status : 0;
  if (status === 0 || status === 403 || status === 429) {
    // One warn per closed -> open transition; never logs keys or URLs.
    if (now >= trippedUntil) console.warn(`[places] Google breaker open for ${BREAKER_MS / 60_000} min (status ${status})`);
    trippedUntil = now + BREAKER_MS;
    return true;
  }
  return false;
}

const resolveConfig = (deps: Deps): MapsConfig =>
  deps.config ?? (deps.key !== undefined ? readMapsConfig({ GEOAPIFY_API_KEY: deps.key }) : MAPS_CONFIG);

/** Consumes one unit of a daily bucket. Fails open when the limiter throws. */
async function consumeDaily(
  consume: Consume,
  bucket: string,
  max: number,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  try {
    const r = await consume(bucket, max, DAY);
    return r.ok ? { ok: true } : { ok: false, retryAfter: r.retryAfter };
  } catch {
    return { ok: true };
  }
}

async function tryGoogle(q: string, cfg: MapsConfig, deps: Deps): Promise<PlaceSuggestion[]> {
  if (!cfg.googlePlaces || deps.skipGoogle) return [];
  const now = deps.now ?? Date.now;
  if (now() < trippedUntil || now() < budgetExhaustedUntil) return [];
  const fake = cfg.google.fake;
  if (!fake) {
    const r = await consumeDaily(deps.consume ?? consumeRateLimitKey, 'gplaces:autocomplete', cfg.google.caps.autocomplete);
    if (!r.ok) return [];
  }
  try {
    return await googleAutocomplete(q, {
      key: cfg.google.serverKey,
      lang: queryLang(q),
      session: deps.session ?? null,
      fetchImpl: fake ? fakeGoogleFetch() : (deps.fetchImpl ?? fetch),
      bias: deps.bias,
    });
  } catch (e) {
    noteGoogleFailure(e, now());
    return [];
  }
}

export const withTz = <T extends PlaceSuggestion>(p: T): T =>
  p.timeZone || p.lat == null || p.lng == null ? p : { ...p, timeZone: timeZoneAt(p.lat, p.lng) };

export async function searchPlaces(q: string, deps: Deps = {}): Promise<PlaceSuggestion[]> {
  const cfg = resolveConfig(deps);
  const key = deps.key ?? cfg.geoapifyKey;
  const fetchImpl = deps.fetchImpl ?? fetch;
  let results = await tryGoogle(q, cfg, deps);
  if (results.length === 0 && key) {
    results = await geoapifyAutocomplete(q, { key, lang: queryLang(q), fetchImpl, signal: deps.signal, bias: deps.bias }).catch(() => []);
  }
  // Photon covers Geoapify outages, the daily credit cap (429) and misses.
  if (results.length === 0) results = await photonSearch(q, { fetchImpl, signal: deps.signal, bias: deps.bias }).catch(() => []);
  return results.map(withTz);
}

export async function suggestFromLink(url: string, deps: Deps = {}): Promise<LinkSuggestions> {
  const link = await readGmapsLink(url, { fetchImpl: deps.fetchImpl, signal: deps.signal });
  if (!link) return { results: [], linkError: 'unresolved' };
  if (link.lat !== null && link.lng !== null) {
    const { lat, lng } = link;
    return {
      results: [{
        id: link.cid ? `gcid:${link.cid}` : (link.googlePlaceId ?? ''),
        name: link.name ?? link.query ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        secondary: null,
        address: null,
        lat,
        lng,
        kind: 'sight',
        timeZone: timeZoneAt(lat, lng),
      }],
      linkError: null,
    };
  }
  const text = link.query ?? link.name;
  // Google mode: hand the place id to the picker, which fetches coords via details.
  // Needs the link's own name: the basic details mask has no displayName.
  const gid = link.googlePlaceId;
  if (text && gid && resolveConfig(deps).googlePlaces && isValidGoogleId(gid)) {
    return {
      results: [{
        id: gid,
        name: link.name ?? text,
        secondary: null,
        address: null,
        lat: null,
        lng: null,
        kind: 'sight',
        timeZone: null,
      }],
      linkError: null,
    };
  }
  if (text) return { results: await searchPlaces(text, deps), linkError: null };
  return { results: [], linkError: 'unresolved' };
}

export async function getPlaceDetail(
  id: string,
  lang: 'th' | 'en',
  deps: Deps = {},
): Promise<PlaceDetail | null> {
  const cfg = resolveConfig(deps);
  const provider = placeProvider(id);
  if (provider === 'google') return googlePlaceDetail(id, lang, cfg, deps);
  const key = deps.key ?? cfg.geoapifyKey;
  if (!key || provider !== 'geoapify') return null;
  const d = await geoapifyDetails(id.slice('geoapify:'.length), {
    key, lang, fetchImpl: deps.fetchImpl ?? fetch,
  }).catch(() => null);
  return d ? withTz(d) : null;
}

async function googlePlaceDetail(
  id: string,
  lang: 'th' | 'en',
  cfg: MapsConfig,
  deps: Deps,
): Promise<PlaceDetail | null> {
  if (!cfg.googlePlaces || !isValidGoogleId(id)) return null;
  const now = deps.now ?? Date.now;
  if (now() < trippedUntil || now() < budgetExhaustedUntil) return null;
  const fields = deps.fields ?? 'basic';
  const fake = cfg.google.fake;
  if (!fake) {
    const r = await consumeDaily(deps.consume ?? consumeRateLimitKey, `gplaces:details:${fields}`, cfg.google.caps[fields]);
    if (!r.ok) {
      // Map previews are optional: a spent preview budget only hides the preview.
      if (fields === 'preview') return null;
      // Also stops Google autocomplete until the window resets.
      const until = now() + r.retryAfter * 1000;
      // One warn when the latch is newly set, not on every denied call.
      if (now() >= budgetExhaustedUntil) console.warn(`[places] Google budget exhausted (bucket gplaces:details:${fields}); Google off until reset`);
      budgetExhaustedUntil = until;
      return null;
    }
  }
  try {
    const d = await googleDetails(id, {
      key: cfg.google.serverKey,
      lang,
      session: deps.session ?? null,
      fields,
      fetchImpl: fake ? fakeGoogleFetch() : (deps.fetchImpl ?? fetch),
    });
    return d ? withTz(d) : null;
  } catch (e) {
    noteGoogleFailure(e, now());
    return null;
  }
}

const PHOTO_WIDTH_PX = 480;

/** Resolves a Place Photo name to its image URL for the map-preview card. Own budget; a denial never latches Google off. */
export async function getPlacePhotoUri(name: string, deps: Deps = {}): Promise<string | null> {
  const cfg = resolveConfig(deps);
  if (!cfg.googlePlaces || cfg.google.fake || !isValidPhotoName(name)) return null;
  const now = deps.now ?? Date.now;
  if (now() < trippedUntil || now() < budgetExhaustedUntil) return null;
  const r = await consumeDaily(deps.consume ?? consumeRateLimitKey, 'gplaces:photo', cfg.google.caps.photo);
  if (!r.ok) return null;
  try {
    return await googlePhotoUri(name, { key: cfg.google.serverKey, maxWidthPx: PHOTO_WIDTH_PX, fetchImpl: deps.fetchImpl ?? fetch });
  } catch (e) {
    // Only key/quota errors speak for Google's health; a slow optional image
    // (timeout, network) must not switch search and add off.
    if (e instanceof GoogleHttpError && (e.status === 403 || e.status === 429)) noteGoogleFailure(e, now());
    return null;
  }
}
