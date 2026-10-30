'use client';

// Mobile-only switch between the itinerary list and the full-screen map.
// List mode: a pair of pressed-state buttons (a labelled group, not tabs:
// there are no tab panels) above the bottom nav. Full-map: a top-left "List"
// button instead, clear of the OS gesture strip and the browser's bottom
// toolbar; OS/browser Back closes the map too (map-preview-context.tsx). The
// flag lives in MapPreviewProvider (so the search picker's "View on map" can
// open the map too), which mirrors it to body[data-fullmap]; globals.css does
// the layout swap. Hidden on md+ where list and map sit side by side.

import { useEffect, useRef } from 'react';
import { ChevronLeft, Note, MapPin } from '@/components/icons';
import { useMapPreview } from './map-preview-context';
import { useT } from './i18n-provider';

export function MapPanelToggle() {
  const { fullMap: full, openFullMap, closeFullMap } = useMapPreview();
  const t = useT();

  // Leaving the itinerary returns to list mode (in place: no history.back()).
  useEffect(() => () => closeFullMap({ viaHistory: false }), [closeFullMap]);

  // The two modes render different buttons: after a switch from the keyboard
  // (focus dropped with the old button), move focus to the new one.
  const focusTarget = useRef<HTMLButtonElement>(null);
  const shownFull = useRef(full);
  useEffect(() => {
    if (shownFull.current === full) return; // first render: never steal focus
    shownFull.current = full;
    if (document.activeElement === document.body) focusTarget.current?.focus();
  }, [full]);

  if (full) {
    // data-map-toggle: the full-map height rule in globals.css skips it, so
    // the wrapper stays button-sized and never blocks the map's left edge.
    return (
      <div
        data-map-toggle
        className="fixed left-3 z-[60] md:hidden"
        style={{ top: 'calc(12px + env(safe-area-inset-top))' }}
      >
        <button
          ref={focusTarget}
          type="button"
          aria-label={t('map_back_to_list_aria')}
          onClick={() => closeFullMap()}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-surface pl-3 pr-4 text-sm font-semibold text-foreground shadow-[var(--shadow-md)]"
        >
          <ChevronLeft width={18} height={18} aria-hidden />
          {t('map_view_list')}
        </button>
      </div>
    );
  }

  const seg = (active: boolean) =>
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-colors ' +
    (active
      ? 'bg-brand text-brand-foreground'
      : 'text-muted hover:text-foreground');

  return (
    <div
      data-map-toggle
      className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 md:hidden"
    >
      <div
        role="group"
        aria-label={t('map_view_aria')}
        className="flex items-center rounded-full border border-border bg-surface p-1 shadow-[var(--shadow-lg)]"
      >
        <button type="button" aria-pressed className={seg(true)}>
          <Note width={16} height={16} aria-hidden />
          {t('map_view_list')}
        </button>
        <button ref={focusTarget} type="button" aria-pressed={false} onClick={() => openFullMap()} className={seg(false)}>
          <MapPin width={16} height={16} aria-hidden />
          {t('map_view_map')}
        </button>
      </div>
    </div>
  );
}
