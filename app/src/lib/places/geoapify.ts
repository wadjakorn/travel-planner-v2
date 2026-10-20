import { kindFromCategories } from './kind';
import type { PlaceDetail, PlaceSuggestion } from './types';

const BASE = 'https://api.geoapify.com';
// Results are allowed to be cached/stored (Geoapify Places FAQ); a month of
// Next data-cache keeps repeat searches off the 3k/day free credits.
const CACHE = { next: { revalidate: 60 * 60 * 24 * 30 } };

type Props = {
  place_id?: string;
  name?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  lat?: number;
  lon?: number;
  category?: string;
  categories?: string[];
  timezone?: { name?: string };
  feature_type?: string;
  website?: string;
  contact?: { phone?: string };
  opening_hours?: string;
};

function toSuggestion(r: Props): PlaceSuggestion | null {
  if (!r.place_id || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return null;
  // `||`: real autocomplete rows carry name: "" for address-only results.
  const name = r.name || r.address_line1 || r.formatted;
  if (!name) return null;
  const cats = [...(r.categories ?? []), ...(r.category ? [r.category] : [])];
  return {
    id: `geoapify:${r.place_id}`,
    name,
    secondary: r.address_line2 ?? null,
    address: r.formatted ?? null,
    lat: r.lat!,
    lng: r.lon!,
    kind: kindFromCategories(cats),
    timeZone: r.timezone?.name ?? null,
  };
}

export function parseGeoapifyAutocomplete(json: unknown): PlaceSuggestion[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.map((r) => toSuggestion(r as Props)).filter((s): s is PlaceSuggestion => s !== null);
}

export function parseGeoapifyDetails(json: unknown): PlaceDetail | null {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const props = features.map((f) => (f as { properties?: Props }).properties ?? {});
  const p = props.find((x) => x.feature_type === 'details') ?? props[0];
  const base = toSuggestion(p);
  if (!base) return null;
  return {
    ...base,
    phone: p.contact?.phone ?? null,
    website: p.website ?? null,
    hours: p.opening_hours ?? null,
  };
}

type Opts = { key: string; lang: 'th' | 'en'; fetchImpl?: typeof fetch; signal?: AbortSignal };

export const withTimeout = (signal?: AbortSignal): AbortSignal =>
  AbortSignal.any([signal, AbortSignal.timeout(4000)].filter((s): s is AbortSignal => s !== undefined));

async function getJson(url: URL, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  const res = await fetchImpl(url, { signal: withTimeout(signal), ...CACHE } as RequestInit);
  if (!res.ok) throw new Error(`geoapify ${res.status}`);
  return res.json();
}

export async function geoapifyAutocomplete(
  text: string,
  { key, lang, fetchImpl = fetch, limit = 8, signal }: Opts & { limit?: number },
): Promise<PlaceSuggestion[]> {
  const url = new URL(`${BASE}/v1/geocode/autocomplete`);
  url.search = new URLSearchParams({
    text, lang, limit: String(limit), format: 'json', bias: 'countrycode:th', apiKey: key,
  }).toString();
  return parseGeoapifyAutocomplete(await getJson(url, fetchImpl, signal));
}

export async function geoapifyDetails(
  rawId: string,
  { key, lang, fetchImpl = fetch, signal }: Opts,
): Promise<PlaceDetail | null> {
  const url = new URL(`${BASE}/v2/place-details`);
  url.search = new URLSearchParams({ id: rawId, features: 'details', lang, apiKey: key }).toString();
  return parseGeoapifyDetails(await getJson(url, fetchImpl, signal));
}
