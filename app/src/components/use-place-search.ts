'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSuggestions } from '@/lib/places/client';
import type { PlaceSuggestion } from '@/lib/places/types';

export function usePlaceSearch({ minChars = 2, limit = 8, debounceMs = 350 } = {}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
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
      if (v.trim().length < minChars) {
        setResults([]);
        return;
      }
      timer.current = window.setTimeout(async () => {
        const ctrl = new AbortController();
        inflight.current = ctrl;
        try {
          const r = await fetchSuggestions(v, ctrl.signal);
          if (!ctrl.signal.aborted) setResults(r.slice(0, limit));
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
  }, [cancel]);

  return { query, results, onQueryChange, reset };
}
