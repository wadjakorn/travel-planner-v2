'use client';

import { useEffect } from 'react';
import { Search } from '@/components/icons';
import { useT } from '@/components/i18n-provider';
import { isTypingTarget, requestDaySearchFocus } from '@/lib/day-search-focus';

// md+ map top row, right of the day bar: jumps to the active day's existing
// search box in the list (opens the day if collapsed). No second search input
// on the map: one picker keeps the session, preview and add state. The `/` key
// does the same. PersistentMap renders this only md+ and for editors; `enabled`
// is false off the itinerary route, where the map section is hidden.

export function MapSearchButton({ dayId, enabled }: { dayId: string; enabled: boolean }) {
  const t = useT();

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      requestDaySearchFocus(dayId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dayId, enabled]);

  return (
    <button
      type="button"
      aria-keyshortcuts="/"
      onClick={() => requestDaySearchFocus(dayId)}
      className="pointer-events-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-foreground shadow-[var(--shadow-md)] hover:bg-surface-2"
    >
      <Search width={16} height={16} aria-hidden />
      {t('map_search_places')}
      <kbd aria-hidden className="rounded border border-border px-1.5 font-sans text-xs text-muted">
        /
      </kbd>
    </button>
  );
}
