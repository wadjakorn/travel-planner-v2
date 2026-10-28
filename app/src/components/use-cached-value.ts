'use client';

import { useEffect, useState } from 'react';
import type { CachedLookup } from '@/lib/map-preview';

// Reads a session-cached async value for `key`. Seeds from the cache
// synchronously so a remounted card shows it at once (no flash). Returns
// undefined while loading, null for "none / failed".
export function useCachedValue<T>(lookup: CachedLookup<T>, key: string | null | undefined): T | null | undefined {
  const [state, setState] = useState<{ key: string; value: T | null } | null>(null);
  useEffect(() => {
    if (!key || lookup.peek(key) !== undefined) return;
    let live = true;
    void lookup(key).then((value) => {
      if (live) setState({ key, value });
    });
    return () => {
      live = false;
    };
  }, [lookup, key]);
  if (!key) return null;
  const hit = lookup.peek(key);
  if (hit !== undefined) return hit;
  return state?.key === key ? state.value : undefined;
}
