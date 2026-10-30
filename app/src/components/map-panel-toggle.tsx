'use client';

// Mobile-only List/Map switch for the trip hub: a pair of pressed-state
// buttons (a labelled group, not tabs: there are no tab panels), the same
// control in the same place in both modes, above the bottom nav (which stays
// in full-map too). OS/browser Back closes the map as well
// (map-preview-context.tsx). The flag lives in MapPreviewProvider (so the
// search picker's "View on map" can open the map too), which mirrors it to
// body[data-fullmap]; globals.css does the layout swap. Hidden on md+ where
// list and map sit side by side.

import { useEffect } from 'react';
import { Note, MapPin } from '@/components/icons';
import { isFullMapEntry } from '@/lib/full-map-history';
import { isPhone, useMapPreview } from './map-preview-context';
import { useT } from './i18n-provider';

export function MapPanelToggle() {
  const { fullMap: full, openFullMap, closeFullMap } = useMapPreview();
  const t = useT();

  // Mounts with the itinerary page (the trip layout and its provider persist
  // across sub-pages). Landing on the map's history entry (Back from Calendar,
  // a reload) reopens the map; leaving the itinerary closes it in place (no
  // history.back()).
  useEffect(() => {
    if (isPhone() && isFullMapEntry(window.history.state)) openFullMap();
    return () => closeFullMap({ viaHistory: false });
  }, [openFullMap, closeFullMap]);

  const seg = (active: boolean) =>
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-colors ' +
    (active
      ? 'bg-brand text-brand-foreground'
      : 'text-muted hover:text-foreground');

  // One DOM tree for both modes: only aria-pressed and classes change, so the
  // focused button survives the switch. The pressed segment does nothing.
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
        <button
          type="button"
          aria-pressed={!full}
          onClick={full ? () => closeFullMap() : undefined}
          className={seg(!full)}
        >
          <Note width={16} height={16} aria-hidden />
          {t('map_view_list')}
        </button>
        <button
          type="button"
          aria-pressed={full}
          onClick={full ? undefined : () => openFullMap()}
          className={seg(full)}
        >
          <MapPin width={16} height={16} aria-hidden />
          {t('map_view_map')}
        </button>
      </div>
    </div>
  );
}
