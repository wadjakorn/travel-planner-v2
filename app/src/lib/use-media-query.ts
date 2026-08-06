'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query. Returns false during SSR and on the first
 * client render, so the server markup is always the narrow layout — a layout
 * that depends on viewport width cannot be resolved on the server, and
 * guessing would produce a hydration mismatch.
 *
 * useSyncExternalStore rather than a setState-in-effect: the change listener
 * is the external store, which is exactly the shape this hook wants.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
