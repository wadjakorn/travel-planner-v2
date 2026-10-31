'use client';

// Mobile-only icon-only List/Map switch for the trip hub. It stays screen-right
// above the bottom nav in both modes; OS/browser Back closes the map as well.
// Hidden on md+ where list and map sit side by side.

import { useEffect } from 'react';
import { Compass, List } from '@/components/icons';
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

  const Icon = full ? List : Compass;
  return (
    <div
      data-map-toggle
      className="pointer-events-none fixed z-[60] md:hidden"
      style={{ bottom: 84, right: 16 }}
    >
      <button
        type="button"
        aria-label={full ? t('map_toggle_to_list_aria') : t('map_toggle_to_map_aria')}
        onClick={() => (full ? closeFullMap() : openFullMap())}
        className={`pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full shadow-[var(--shadow-lg)] ${
          full ? 'border border-border bg-surface text-brand' : 'bg-brand text-brand-foreground'
        }`}
      >
        <Icon width={20} height={20} aria-hidden />
      </button>
    </div>
  );
}
