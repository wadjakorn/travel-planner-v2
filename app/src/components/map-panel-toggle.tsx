'use client';

// Mobile-only pair of pressed-state buttons (a labelled group, not tabs: there
// are no tab panels) to switch the trip hub between the itinerary
// list and the full-screen map. The flag lives in MapPreviewProvider (so the
// search picker's "View on map" can open the map too), which mirrors it to
// body[data-fullmap]; globals.css does the layout swap. Hidden on md+ where
// list and map sit side by side.

import { useEffect } from 'react';
import { Note, MapPin } from '@/components/icons';
import { useMapPreview } from './map-preview-context';
import { useT } from './i18n-provider';

export function MapPanelToggle() {
  const { fullMap: full, setFullMap } = useMapPreview();
  const t = useT();

  // Leaving the itinerary returns to list mode.
  useEffect(() => () => setFullMap(false), [setFullMap]);

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
        <button
          type="button"
          aria-pressed={!full}
          onClick={() => setFullMap(false)}
          className={seg(!full)}
        >
          <Note width={16} height={16} aria-hidden />
          {t('map_view_list')}
        </button>
        <button
          type="button"
          aria-pressed={full}
          onClick={() => setFullMap(true)}
          className={seg(full)}
        >
          <MapPin width={16} height={16} aria-hidden />
          {t('map_view_map')}
        </button>
      </div>
    </div>
  );
}
