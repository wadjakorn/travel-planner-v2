import { queryLang } from './lang';
import { biasQuery, type LatLng } from './bias';
import { placeProvider } from './place-id';
import type { Fields, LinkSuggestions, Located, PlaceDetail, PlaceSuggestion } from './types';

export async function fetchSuggestions(
  q: string,
  signal?: AbortSignal,
  session?: string | null,
  near?: LatLng | null,
): Promise<LinkSuggestions> {
  const sess = session ? `&session=${encodeURIComponent(session)}` : '';
  const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}${sess}${biasQuery(near)}`, { signal });
  if (!res.ok) return { results: [], linkError: null };
  const j = (await res.json()) as { results?: PlaceSuggestion[]; linkError?: 'unresolved' | null };
  return { results: j.results ?? [], linkError: j.linkError ?? null };
}

async function fetchDetail(s: PlaceSuggestion, session: string | null | undefined, fields: Fields): Promise<PlaceDetail | null> {
  try {
    const sess = session ? `&session=${encodeURIComponent(session)}` : '';
    const res = await fetch(
      `/api/places/details?id=${encodeURIComponent(s.id)}&lang=${queryLang(s.name)}${sess}&fields=${fields}`,
    );
    if (!res.ok) return null;
    const { place } = (await res.json()) as { place: PlaceDetail | null };
    return place ? { ...place, name: place.name || s.name } : null;
  } catch {
    return null;
  }
}

// Returns null when the suggestion has no coordinates and details could not supply them.
export async function resolvePlace(
  s: PlaceSuggestion,
  o: { session?: string | null; fields?: Fields } = {},
): Promise<PlaceDetail | null> {
  const hasCoords = s.lat != null && s.lng != null;
  const base: PlaceDetail | null = hasCoords
    ? { ...s, lat: s.lat!, lng: s.lng!, phone: null, website: null, hours: null, rating: null, reviews: null }
    : null;
  const p = placeProvider(s.id);
  if (p === 'osm') return base;
  if (p !== 'geoapify' && p !== 'google') return base;
  const d = await fetchDetail(s, o.session, o.fields ?? 'basic');
  if (!d) return base;
  return base ? { ...base, ...d, name: d.name || s.name } : d;
}

// Fills in coordinates (and address/timeZone) for a Google suggestion, using the
// session-terminating basic details call. Suggestions that already have coords pass through.
// fields 'preview' (map preview, called with no session) also carries the photo ref.
export async function ensureCoords(s: PlaceSuggestion, session: string | null, fields: Fields = 'basic'): Promise<Located | null> {
  if (s.lat != null && s.lng != null) return s as Located;
  const d = await fetchDetail(s, session, fields);
  if (!d) return null;
  const out: Located = { ...s, lat: d.lat, lng: d.lng, address: d.address ?? s.address, timeZone: d.timeZone ?? s.timeZone };
  return fields === 'preview' ? { ...out, photo: d.photo ?? null } : out;
}
