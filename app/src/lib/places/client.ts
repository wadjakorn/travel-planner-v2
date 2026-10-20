import { queryLang } from './lang';
import { placeProvider } from './place-id';
import type { LinkSuggestions, PlaceDetail, PlaceSuggestion } from './types';

export async function fetchSuggestions(q: string, signal?: AbortSignal): Promise<LinkSuggestions> {
  const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) return { results: [], linkError: null };
  const j = (await res.json()) as { results?: PlaceSuggestion[]; linkError?: 'unresolved' | null };
  return { results: j.results ?? [], linkError: j.linkError ?? null };
}

export async function resolvePlace(s: PlaceSuggestion): Promise<PlaceDetail> {
  const base: PlaceDetail = { ...s, phone: null, website: null, hours: null };
  if (placeProvider(s.id) !== 'geoapify') return base;
  try {
    const res = await fetch(
      `/api/places/details?id=${encodeURIComponent(s.id)}&lang=${queryLang(s.name)}`,
    );
    if (!res.ok) return base;
    const { place } = (await res.json()) as { place: PlaceDetail | null };
    return place ? { ...base, ...place, name: place.name || s.name } : base;
  } catch {
    return base;
  }
}
