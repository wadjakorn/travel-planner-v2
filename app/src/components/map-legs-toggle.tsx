'use client';

import { RouteLines } from '@/components/icons';
import { toggleLegs, useLegsShown } from '@/lib/maps/legs-store';
import { useT } from './i18n-provider';
import styles from './map-canvas.module.css';

// Top-right of both trip canvases (inside .overlayTr): shows / hides the day's
// route lines and badges. Fixed name + aria-pressed; the choice is per device
// (lib/maps/legs-store). The canvas mounts it only on a day with a drawn leg.
export function MapLegsToggle() {
  const t = useT();
  const shown = useLegsShown();
  return (
    <button
      type="button"
      data-map-legs-toggle
      className={styles.legsToggle}
      aria-pressed={shown}
      aria-label={t('map_legs_toggle')}
      onClick={toggleLegs}
    >
      <RouteLines aria-hidden />
      <span className={styles.legsTip} aria-hidden>
        {t('map_legs_toggle')}
      </span>
    </button>
  );
}
