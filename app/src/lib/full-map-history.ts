// Pure rules for the phone full-map history entry (components/map-preview-context.tsx).
// Opening the map pushes one same-URL entry tagged FULLMAP_KEY, so OS/browser
// Back closes the map instead of leaving the trip. The tag only marks "already
// pushed": every router commit rewrites history.state without custom keys, so
// ownership of the entry is tracked by the provider, not by the tag.

export const FULLMAP_KEY = 'tpFullMap';
/**
 * Tags the list entry the map was opened from. Back restores it before our
 * popstate listener runs (and re-renders), so the "last map URL" tracker must
 * recognise it and not record the restored, older URL as the map's.
 */
export const LIST_KEY = 'tpMapList';

const tagged = (state: unknown, key: string) =>
  typeof state === 'object' && state !== null && (state as Record<string, unknown>)[key] === 1;

export function isFullMapEntry(state: unknown): boolean {
  return tagged(state, FULLMAP_KEY);
}

export function isMapListEntry(state: unknown): boolean {
  return tagged(state, LIST_KEY);
}

/**
 * On popstate: close when we own a map entry and Back landed on an untagged
 * one. `syncTo` is the map's last URL when Back restored an older one (in-map
 * pin/day changes replace the map entry, so the list entry is stale).
 * Hrefs are `pathname + search`.
 */
export function closeAction({
  landedState,
  owns,
  lastMapHref,
  currentHref,
}: {
  landedState: unknown;
  owns: boolean;
  lastMapHref: string | null;
  currentHref: string;
}): { close: boolean; syncTo: string | null } {
  if (!owns || isFullMapEntry(landedState)) return { close: false, syncTo: null };
  return { close: true, syncTo: lastMapHref && lastMapHref !== currentHref ? lastMapHref : null };
}
