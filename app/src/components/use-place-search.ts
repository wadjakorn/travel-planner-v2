'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { createSessionHolder, type SessionHolder } from '@/lib/places/session';
import { fetchSuggestions } from '@/lib/places/client';
import type { PlaceSuggestion } from '@/lib/places/types';
import type { BBox, LatLng } from '@/lib/places/bias';
import { usePlaceBias } from '@/components/place-bias-context';
import { getMapViewport, subscribeMapViewport, viewportBiasFor } from '@/lib/maps/viewport-store';
import { useTripMapVisible } from '@/components/use-trip-map-visible';

export function usePlaceSearch({ minChars = 2, limit = 8, debounceMs = 350, dayId, near, origin = null }: { minChars?: number; limit?: number; debounceMs?: number; dayId?: string; near?: LatLng | null; origin?: LatLng | null } = {}) {
  const contextNear = usePlaceBias(dayId);
  const effectiveNear = near === undefined ? contextNear : near;
  const viewport = useSyncExternalStore(subscribeMapViewport, getMapViewport, () => null);
  const pathname = usePathname();
  const visible = useTripMapVisible();
  const bbox = near === undefined ? viewportBiasFor(viewport, { pathname, visible, dayId }) : null;
  const nearRef = useRef<LatLng | null>(effectiveNear);
  const bboxRef = useRef<BBox | null>(bbox);
  // Google measures each row's distance from here (lib/places/bias.ts originQuery).
  const originRef = useRef<LatLng | null>(origin);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [linkError, setLinkError] = useState<'unresolved' | null>(null);
  const timer = useRef<number | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const holder = useRef<SessionHolder | null>(null);
  const session = () => (holder.current ??= createSessionHolder());

  const cancel = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    inflight.current?.abort();
  }, []);

  useEffect(() => cancel, [cancel]);

  useEffect(() => {
    nearRef.current = effectiveNear;
  }, [effectiveNear]);
  useEffect(() => {
    bboxRef.current = bbox;
  }, [bbox]);
  useEffect(() => {
    originRef.current = origin;
  }, [origin]);

  const onQueryChange = useCallback(
    (v: string) => {
      setQuery(v);
      cancel();
      setLinkError(null);
      if (v.trim().length < minChars) {
        setResults([]);
        return;
      }
      timer.current = window.setTimeout(async () => {
        const ctrl = new AbortController();
        inflight.current = ctrl;
        try {
          const r = await fetchSuggestions(v, ctrl.signal, session().get(), nearRef.current, bboxRef.current, originRef.current);
          if (!ctrl.signal.aborted) {
            setResults(r.results.slice(0, limit));
            setLinkError(r.linkError);
          }
        } catch {
          if (!ctrl.signal.aborted) setResults([]);
        }
      }, debounceMs);
    },
    [cancel, minChars, limit, debounceMs],
  );

  // Ends the search session: returns the token for the pick's details call and
  // clears it synchronously, so typing during that call starts a new session.
  const takeSession = useCallback((): string | null => holder.current?.take() ?? null, []);

  const reset = useCallback(() => {
    cancel();
    holder.current?.reset();
    setQuery('');
    setResults([]);
    setLinkError(null);
  }, [cancel]);

  const clearResults = useCallback(() => {
    cancel();
    setResults([]);
    setLinkError(null);
  }, [cancel]);

  return { query, results, linkError, onQueryChange, reset, clearResults, takeSession };
}
