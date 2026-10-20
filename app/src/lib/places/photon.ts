import { withTimeout } from './geoapify';
import { kindFromOsm } from './kind';
import type { PlaceSuggestion } from './types';

type Feature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string; osm_id?: number; osm_key?: string; osm_value?: string; name?: string;
    housenumber?: string; street?: string; district?: string; city?: string; state?: string; country?: string;
  };
};

export function parsePhoton(json: unknown): PlaceSuggestion[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: PlaceSuggestion[] = [];
  for (const f of features as Feature[]) {
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (!p.name || !p.osm_type || p.osm_id == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const secondary = [street, p.district, p.city, p.state, p.country].filter(Boolean).join(', ') || null;
    out.push({
      id: `osm:${p.osm_type}${p.osm_id}`,
      name: p.name,
      secondary,
      address: secondary ? `${p.name}, ${secondary}` : p.name,
      lat: lat!,
      lng: lng!,
      kind: kindFromOsm(p.osm_key, p.osm_value),
      timeZone: null,
    });
  }
  return out;
}

export async function photonSearch(
  q: string,
  { fetchImpl = fetch, limit = 8, signal }: { fetchImpl?: typeof fetch; limit?: number; signal?: AbortSignal } = {},
): Promise<PlaceSuggestion[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.search = new URLSearchParams({ q, limit: String(limit), lat: '13.75', lon: '100.5' }).toString();
  const res = await fetchImpl(url, {
    signal: withTimeout(signal),
    headers: { 'User-Agent': 'travel-planner-v2' },
    next: { revalidate: 60 * 60 * 24 * 30 },
  } as RequestInit);
  if (!res.ok) throw new Error(`photon ${res.status}`);
  return parsePhoton(await res.json());
}
