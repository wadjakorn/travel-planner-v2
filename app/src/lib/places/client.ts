import { queryLang } from './lang';
import { placeProvider } from './place-id';
import type { PlaceDetail, PlaceSuggestion } from './types';

export async function fetchSuggestions(q: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) return [];
  return ((await res.json()) as { results?: PlaceSuggestion[] }).results ?? [];
}

export async function resolvePlace(s: PlaceSuggestion): Promise<PlaceDetail> {
  // Task 5: suggestions here always have coords today; replace with real null-coord handling.
  const base: PlaceDetail = {
    ...s, lat: s.lat!, lng: s.lng!, phone: null, website: null, hours: null, rating: null, reviews: null,
  };
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
