'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSuggestions } from '@/lib/places/client';
import type { PlaceSuggestion } from '@/lib/places/types';

export function usePlaceSearch({ minChars = 2, limit = 8, debounceMs = 350 } = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [linkError, setLinkError] = useState<'unresolved' | null>(null);
  const timer = useRef<number | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    inflight.current?.abort();
  }, []);

  useEffect(() => cancel, [cancel]);

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
          const r = await fetchSuggestions(v, ctrl.signal);
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

  const reset = useCallback(() => {
    cancel();
    setQuery('');
    setResults([]);
    setLinkError(null);
  }, [cancel]);

  const clearResults = useCallback(() => {
    cancel();
    setResults([]);
    setLinkError(null);
  }, [cancel]);

  return { query, results, linkError, onQueryChange, reset, clearResults };
}
