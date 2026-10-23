'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSessionHolder, type SessionHolder } from '@/lib/places/session';
import { fetchSuggestions } from '@/lib/places/client';
import type { PlaceSuggestion } from '@/lib/places/types';

export function usePlaceSearch({ minChars = 2, limit = 8, debounceMs = 350 } = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const timer = useRef<number | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const holder = useRef<SessionHolder | null>(null);
  const session = () => (holder.current ??= createSessionHolder());

  const cancel = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    inflight.current?.abort();
  }, []);

  useEffect(() => cancel, [cancel]);

  const onQueryChange = useCallback(
    (v: string) => {
      setQuery(v);
      cancel();
      if (v.trim().length < minChars) {
        setResults([]);
        return;
      }
      timer.current = window.setTimeout(async () => {
        const ctrl = new AbortController();
        inflight.current = ctrl;
        try {
          const r = await fetchSuggestions(v, ctrl.signal, session().get());
          if (!ctrl.signal.aborted) setResults(r.slice(0, limit));
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
  }, [cancel]);

  const clearResults = useCallback(() => {
    cancel();
    setResults([]);
  }, [cancel]);

  return { query, results, onQueryChange, reset, clearResults, takeSession };
}
