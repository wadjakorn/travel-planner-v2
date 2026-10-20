import 'server-only';
import { geoapifyAutocomplete, geoapifyDetails } from './geoapify';
import { readGmapsLink } from './gmaps-link';
import { queryLang } from './lang';
import { photonSearch } from './photon';
import { placeProvider } from './place-id';
import { timeZoneAt } from './tz-lookup';
import type { LinkSuggestions, PlaceDetail, PlaceSuggestion } from './types';

type Deps = { key?: string; fetchImpl?: typeof fetch; signal?: AbortSignal };

const withTz = <T extends PlaceSuggestion>(p: T): T =>
  p.timeZone ? p : { ...p, timeZone: timeZoneAt(p.lat, p.lng) };

export async function searchPlaces(q: string, deps: Deps = {}): Promise<PlaceSuggestion[]> {
  const key = deps.key ?? process.env.GEOAPIFY_API_KEY ?? '';
  const fetchImpl = deps.fetchImpl ?? fetch;
  let results: PlaceSuggestion[] = [];
  if (key) {
    results = await geoapifyAutocomplete(q, { key, lang: queryLang(q), fetchImpl, signal: deps.signal }).catch(() => []);
  }
  // Photon covers Geoapify outages, the daily credit cap (429) and misses.
  if (results.length === 0) results = await photonSearch(q, { fetchImpl, signal: deps.signal }).catch(() => []);
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
  if (text) return { results: await searchPlaces(text, deps), linkError: null };
  return { results: [], linkError: 'unresolved' };
}

export async function getPlaceDetail(
  id: string,
  lang: 'th' | 'en',
  deps: Deps = {},
): Promise<PlaceDetail | null> {
  const key = deps.key ?? process.env.GEOAPIFY_API_KEY ?? '';
  if (!key || placeProvider(id) !== 'geoapify') return null;
  const d = await geoapifyDetails(id.slice('geoapify:'.length), {
    key, lang, fetchImpl: deps.fetchImpl ?? fetch,
  }).catch(() => null);
  return d ? withTz(d) : null;
}
