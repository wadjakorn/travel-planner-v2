import 'server-only';
import { geoapifyAutocomplete, geoapifyDetails } from './geoapify';
import { queryLang } from './lang';
import { photonSearch } from './photon';
import { placeProvider } from './place-id';
import { timeZoneAt } from './tz-lookup';
import type { PlaceDetail, PlaceSuggestion } from './types';

type Deps = { key?: string; fetchImpl?: typeof fetch };

export const withTz = <T extends PlaceSuggestion>(p: T): T =>
  p.timeZone || p.lat == null || p.lng == null ? p : { ...p, timeZone: timeZoneAt(p.lat, p.lng) };

export async function searchPlaces(q: string, deps: Deps = {}): Promise<PlaceSuggestion[]> {
  const key = deps.key ?? process.env.GEOAPIFY_API_KEY ?? '';
  const fetchImpl = deps.fetchImpl ?? fetch;
  let results: PlaceSuggestion[] = [];
  if (key) {
    results = await geoapifyAutocomplete(q, { key, lang: queryLang(q), fetchImpl }).catch(() => []);
  }
  // Photon covers Geoapify outages, the daily credit cap (429) and misses.
  if (results.length === 0) results = await photonSearch(q, { fetchImpl }).catch(() => []);
  return results.map(withTz);
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
