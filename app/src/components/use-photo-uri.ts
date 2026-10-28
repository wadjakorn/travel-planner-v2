'use client';

import { createCachedLookup, photoUriUrl } from '@/lib/map-preview';
import { useCachedValue } from './use-cached-value';

// Photo name -> short-lived image URL, resolved once per page session and kept
// in memory only (the route is no-store), so reopening a card is not re-billed.
// A failure is not cached: the next open retries.
const uris = createCachedLookup<string>(async (name) => {
  const res = await fetch(photoUriUrl(name));
  if (!res.ok) throw new Error(`photo ${res.status}`);
  return ((await res.json()) as { uri: string | null }).uri;
});

/** undefined while resolving, null when unavailable, else the image URL. */
export function usePhotoUri(name: string): string | null | undefined {
  return useCachedValue(uris, name);
}
