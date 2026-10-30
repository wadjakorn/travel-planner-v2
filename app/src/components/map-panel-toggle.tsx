'use client';

// Mobile-only List/Map switch for the trip hub: one button naming the other
// view, the same control in the same place in both modes, at the right end of
// the phone map's control column (lib/map-carousel.ts) above the bottom nav.
// OS/browser Back closes the map as well (map-preview-context.tsx). The flag
// lives in MapPreviewProvider (so the search picker's "View on map" can open
// the map too), which mirrors it to body[data-fullmap]; globals.css does the
// layout swap. Hidden on md+ where list and map sit side by side.

import { useEffect } from 'react';
import { Note, MapPin } from '@/components/icons';
import { isFullMapEntry } from '@/lib/full-map-history';
import { CARD_WIDTH, MAP_TOGGLE_WIDTH } from '@/lib/map-carousel';
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

  const Icon = full ? Note : MapPin;
  // bottom: the 56 px nav + 28 (the control row's offset in map-stop-carousel).
  // The wrapper spans the column, so it must not swallow taps on what's behind.
  return (
    <div
      data-map-toggle
      className="pointer-events-none fixed inset-x-0 z-[60] mx-auto flex justify-end md:hidden"
      style={{ bottom: 84, width: CARD_WIDTH }}
    >
      <button
        type="button"
        aria-label={full ? t('map_toggle_to_list_aria') : t('map_toggle_to_map_aria')}
        onClick={() => (full ? closeFullMap() : openFullMap())}
        className="pointer-events-auto inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm font-semibold text-foreground shadow-[var(--shadow-md)]"
        style={{ width: MAP_TOGGLE_WIDTH }}
      >
        <Icon width={16} height={16} aria-hidden />
        {full ? t('map_view_list') : t('map_view_map')}
      </button>
    </div>
  );
}
