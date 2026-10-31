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
 * Hrefs are `pathname + search`; only a same-pathname landing is synced.
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
  // Only re-point the itinerary: a traversal to another page (Forward to a
  // trip tab) is never pulled back to the map's URL.
  const samePage = lastMapHref != null && lastMapHref.split('?')[0] === currentHref.split('?')[0];
  return { close: true, syncTo: samePage && lastMapHref !== currentHref ? lastMapHref : null };
}

/** The entry to write for a shallow selection. Without __NA, Next's patched history syncs the URL into the router. */
export function shallowEntryState(state: unknown, mode: 'replace' | 'push'): Record<string, unknown> {
  if (mode === 'push' || typeof state !== 'object' || state === null) return {};
  const next = { ...(state as Record<string, unknown>) };
  delete next.__NA;
  return next;
}

// A link to another page was tapped and has not landed. Next's router cancels a
// pending navigation for any newer one, the shallow restore included.
let leavingTo: string | null = null;
export function setLeavingTo(pathname: string | null) {
  leavingTo = pathname;
}

/**
 * Selects a stop (`?day=&placeId=`) without a server round trip: the list and
 * map read it from useSearchParams. Does nothing once the page is moving on: a
 * carousel `scrollend` fired by leaving through a tab must neither rewrite that
 * URL nor cancel the navigation.
 */
export function selectStop(href: string, mode: 'replace' | 'push' = 'replace') {
  const { pathname, search } = window.location;
  const target = new URL(href, window.location.href);
  if (leavingTo || target.pathname !== pathname || target.search === search) return;
  const write = mode === 'push' ? window.history.pushState : window.history.replaceState;
  write.call(window.history, shallowEntryState(window.history.state, mode), '', href);
}

const stopOf = (href: string) => {
  const qs = new URLSearchParams(href.split('?')[1] ?? '');
  return `${Number(qs.get('day'))}/${qs.get('placeId') ?? ''}`;
};

/** Same `(day, placeId)`? A missing `day` means day 0, and param order does not matter. */
export function sameStop(a: string, b: string): boolean {
  return stopOf(a) === stopOf(b);
}

/**
 * On closing the map: the URL the list should scroll to, or null to keep its
 * place. `openedAt` is the map's URL when we pushed its entry; without one (the
 * entry was reused after a reload or Back, so the list was remounted at the
 * top) there is no place to keep. A landing on another page never scrolls.
 */
export function returnScrollTarget(openedAt: string | null, mapHref: string | null, currentHref: string): string | null {
  if (mapHref == null || mapHref.split('?')[0] !== currentHref.split('?')[0]) return null;
  return openedAt != null && sameStop(openedAt, mapHref) ? null : mapHref;
}

/** The day covering the most of a column; null with none on screen. */
export function dominantDay(days: { idx: number; top: number; bottom: number }[], colTop: number, colBottom: number): number | null {
  let best: number | null = null;
  let most = 0;
  for (const d of days) {
    const covered = Math.min(d.bottom, colBottom) - Math.max(d.top, colTop);
    if (covered > most) {
      most = covered;
      best = d.idx;
    }
  }
  return best;
}
