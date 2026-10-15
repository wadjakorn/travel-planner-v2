export type PlaceProvider = 'google' | 'geoapify' | 'osm';

// Legacy rows hold bare Google place_ids (which never contain ':'); every
// other provider is stored as "<provider>:<id>" so deep links can tell them apart.
export function placeProvider(id: string | null | undefined): PlaceProvider | null {
  if (!id) return null;
  const i = id.indexOf(':');
  if (i === -1) return 'google';
  const p = id.slice(0, i);
  return p === 'geoapify' || p === 'osm' ? p : null;
}

export function isGooglePlaceId(id: string | null | undefined): boolean {
  return placeProvider(id) === 'google';
}
