'use client';

// Shared client state between the itinerary (search picker, mobile toggle) and
// the persistent trip map, which are siblings under the trip layout with no
// other channel than the URL. Holds the ephemeral search preview (never in the
// URL/history) and the mobile full-map flag. Renders no DOM: the mobile
// full-map CSS selects on the layout's direct children (globals.css).

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { previewReducer, type MapPreview } from '@/lib/map-preview';

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
  setFullMap: (on: boolean) => void;
};

const noop = () => {};
const MapPreviewCtx = createContext<Ctx>({
  preview: null,
  begin: () => 0,
  isCurrent: () => false,
  setPreview: () => false,
  clearPreview: noop,
  fullMap: false,
  setFullMap: noop,
});

export function MapPreviewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(previewReducer, { preview: null, latest: 0 });
  // Mirrors state.latest synchronously so begin() can hand out the token
  // before React re-renders; every action that bumps `latest` bumps this too.
  const latest = useRef(0);
  const [fullMap, setFullMap] = useState(false);

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

  useEffect(() => {
    if (fullMap) document.body.dataset.fullmap = '1';
    else delete document.body.dataset.fullmap;
    // Leaving the trip layout in full-map mode must not leave the next page
    // with its header hidden (globals.css full-map rules).
    return () => {
      delete document.body.dataset.fullmap;
    };
  }, [fullMap]);

  const value = useMemo(
    () => ({ preview: state.preview, begin, isCurrent, setPreview, clearPreview, fullMap, setFullMap }),
    [state.preview, begin, isCurrent, setPreview, clearPreview, fullMap],
  );
  return <MapPreviewCtx.Provider value={value}>{children}</MapPreviewCtx.Provider>;
}

export function useMapPreview(): Ctx {
  return useContext(MapPreviewCtx);
}
