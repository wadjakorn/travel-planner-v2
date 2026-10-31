'use client';

// Shared client state between the itinerary (search picker, mobile toggle) and
// the persistent trip map, which are siblings under the trip layout with no
// other channel than the URL. Holds the ephemeral search preview (never in the
// URL/history) and the mobile full-map flag. Renders no DOM: the mobile
// full-map CSS selects on the layout's direct children (globals.css).
//
// Phone full-map owns one history entry (lib/full-map-history.ts), so OS /
// browser Back closes the map instead of leaving the trip.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { previewReducer, type MapPreview } from '@/lib/map-preview';
import { FULLMAP_KEY, LIST_KEY, closeAction, isFullMapEntry, isMapListEntry, returnScrollTarget, selectStop, setLeavingTo } from '@/lib/full-map-history';

type Ctx = {
  preview: MapPreview | null;
  /** Takes a request token before an async coords lookup. */
  begin: () => number;
  /** Whether no other begin/clear happened since `token`. */
  isCurrent: (token: number) => boolean;
  /** Lands only if no other begin/clear happened since `token`; returns whether it did. */
  setPreview: (p: MapPreview, token: number) => boolean;
  /** Clears when owned by `ownerId` (or always, without one); also voids in-flight lookups. */
  clearPreview: (ownerId?: string) => void;
  fullMap: boolean;
  /** Opens the full-screen map; on phones also pushes the map's history entry. */
  openFullMap: () => void;
  /**
   * Closes it. By default via `history.back()` when we own the map entry, so
   * the stack stays clean; `viaHistory: false` (unmount on leaving the
   * itinerary) closes in place.
   */
  closeFullMap: (opts?: { viaHistory?: boolean }) => void;
  /** Set on closing the map on a changed stop: the URL the list scrolls to once it is showing it. */
  returnTo: string | null;
  clearReturnTo: () => void;
};

const noop = () => {};
const MapPreviewCtx = createContext<Ctx>({
  preview: null,
  begin: () => 0,
  isCurrent: () => false,
  setPreview: () => false,
  clearPreview: noop,
  fullMap: false,
  openFullMap: noop,
  closeFullMap: noop,
  returnTo: null,
  clearReturnTo: noop,
});

export const isPhone = () => !window.matchMedia('(min-width: 768px)').matches;
const here = () => window.location.pathname + window.location.search;

export function MapPreviewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(previewReducer, { preview: null, latest: 0 });
  // Mirrors state.latest synchronously so begin() can hand out the token
  // before React re-renders; every action that bumps `latest` bumps this too.
  const latest = useRef(0);
  const [fullMap, setFullMap] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Refs, set synchronously, so open/close keep a stable identity (the
  // toggle's unmount cleanup depends on it) and a double tap can't go back twice.
  const fullRef = useRef(false);
  /** We pushed (or reused) the map's history entry and haven't left it. */
  const owns = useRef(false);
  /** "List" called history.back(); the popstate it causes does the close. */
  const leaving = useRef(false);
  const lastMapHref = useRef<string | null>(null);
  /** The URL when we pushed the map's entry; null when it was already there. */
  const openedAt = useRef<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const clearReturnTo = useCallback(() => setReturnTo(null), []);

  const begin = useCallback(() => {
    latest.current += 1;
    dispatch({ type: 'begin' });
    return latest.current;
  }, []);
  const isCurrent = useCallback((token: number) => token === latest.current, []);
  const setPreview = useCallback((preview: MapPreview, token: number) => {
    if (token !== latest.current) return false;
    dispatch({ type: 'set', preview, token });
    return true;
  }, []);
  const clearPreview = useCallback((ownerId?: string) => {
    latest.current += 1;
    dispatch({ type: 'clear', ownerId });
  }, []);

  const openFullMap = useCallback(() => {
    if (fullRef.current) return; // already open: never push a second entry
    fullRef.current = true;
    lastMapHref.current = here();
    openedAt.current = null;
    setReturnTo(null);
    setFullMap(true);
    if (!isPhone()) return;
    // No URL argument, and the spread keeps Next's __NA: its patched pushState
    // passes the entry straight through.
    if (!isFullMapEntry(window.history.state)) {
      openedAt.current = here();
      window.history.replaceState({ ...window.history.state, [LIST_KEY]: 1 }, '');
      window.history.pushState({ ...window.history.state, [LIST_KEY]: undefined, [FULLMAP_KEY]: 1 }, '');
    }
    owns.current = true;
  }, []);

  const closeFullMap = useCallback((opts?: { viaHistory?: boolean }) => {
    const viaHistory = opts?.viaHistory !== false;
    // A second tap while our history.back() is in flight: its popstate closes.
    if (viaHistory && leaving.current) return;
    if (viaHistory && owns.current) {
      // selectStop has moved the URL already; the tracking effect may not have run yet.
      lastMapHref.current = here();
      owns.current = false;
      leaving.current = true;
      window.history.back();
      return;
    }
    owns.current = false;
    leaving.current = false;
    fullRef.current = false;
    setFullMap(false);
  }, []);

  // Router commits (in-map replaces, refresh, server-action revalidation)
  // rewrite history.state without our keys. Keep the map entry tagged, so
  // coming back to it (Back from another tab, a reload) reopens the map
  // (map-panel-toggle.tsx). No URL argument, and the spread keeps Next's __NA:
  // its patched replaceState passes it straight through.
  const retag = useCallback(() => {
    if (!fullRef.current || !owns.current || !isPhone()) return;
    if (!isFullMapEntry(window.history.state)) {
      window.history.replaceState({ ...window.history.state, [FULLMAP_KEY]: 1 }, '');
    }
  }, []);

  // In-map pin / day changes replace the map entry; remember where it ended
  // up. Back restores (and renders) the tagged list entry before popstate
  // fires: never record that older URL as the map's.
  useEffect(() => {
    if (fullRef.current && !isMapListEntry(window.history.state)) lastMapHref.current = here();
    retag();
  }, [pathname, searchParams, retag]);

  useEffect(() => {
    setLeavingTo(null);
    // Back cancels a pending link navigation without changing the pathname.
    const clear = () => setLeavingTo(null);
    window.addEventListener('popstate', clear);
    return () => window.removeEventListener('popstate', clear);
  }, [pathname]);

  // A refresh changes neither pathname nor search, so also tag at the moment
  // of leaving: capture runs before <Link>'s own click handler.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a) return;
      retag();
      const to = new URL((a as HTMLAnchorElement).href);
      const inPlace = (a as HTMLAnchorElement).target === '_blank' || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
      const leaving = !inPlace && to.origin === window.location.origin && to.pathname !== window.location.pathname;
      setLeavingTo(leaving ? to.pathname : null);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [retag]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (!fullRef.current || !(owns.current || leaving.current)) return;
      const { close, syncTo } = closeAction({
        landedState: e.state,
        owns: true,
        lastMapHref: lastMapHref.current,
        currentHref: here(),
      });
      // Our own "List" back always closes, wherever it landed.
      if (!close && !leaving.current) return;
      if (isPhone()) setReturnTo(returnScrollTarget(openedAt.current, lastMapHref.current, here()));
      owns.current = false;
      leaving.current = false;
      fullRef.current = false;
      setFullMap(false);
      // Back restored the list entry's older ?day=&placeId=; show what the map showed.
      if (syncTo && isPhone()) selectStop(syncTo);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Layout, not passive: the carousel's own effect scrolls to the active card and
  // needs the section displayed. A parent's passive effect would run after it.
  useLayoutEffect(() => {
    if (fullMap) document.body.dataset.fullmap = '1';
    else delete document.body.dataset.fullmap;
    // Leaving the trip layout in full-map mode must not leave the next page
    // with its header hidden (globals.css full-map rules).
    return () => {
      delete document.body.dataset.fullmap;
    };
  }, [fullMap]);

  const value = useMemo(
    () => ({ preview: state.preview, begin, isCurrent, setPreview, clearPreview, fullMap, openFullMap, closeFullMap, returnTo, clearReturnTo }),
    [state.preview, begin, isCurrent, setPreview, clearPreview, fullMap, openFullMap, closeFullMap, returnTo, clearReturnTo],
  );
  return <MapPreviewCtx.Provider value={value}>{children}</MapPreviewCtx.Provider>;
}

export function useMapPreview(): Ctx {
  return useContext(MapPreviewCtx);
}
