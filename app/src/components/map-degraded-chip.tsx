'use client';

import { useEffect, useState } from 'react';
import { Close } from '@/components/icons';
import { useGoogleMapsConfig } from './maps-config-provider';
import { useT } from './i18n-provider';
import styles from './map-canvas.module.css';

// Module scope, so a dismiss survives the canvas unmounting and remounting
// (day switch, sub-page) and resets on reload, exactly like `degraded`, which
// is provider state for one page load.
let dismissedThisPage = false;

// Top-right notice in the MapLibre trip canvas while the page session has
// fallen back from Google. Never shows in open mode (markDegraded is a no-op).
export function MapDegradedChip() {
  const { degraded } = useGoogleMapsConfig();
  const t = useT();
  const [dismissed, setDismissed] = useState(() => dismissedThisPage);
  // The canvas (and this chip) mounts on degrade, so a live region mounted
  // with its text is often not announced. Mount it empty, fill it a frame
  // later.
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    if (!degraded) return;
    const id = requestAnimationFrame(() => setAnnounce(true));
    return () => cancelAnimationFrame(id);
  }, [degraded]);
  if (!degraded || dismissed) return null;
  return (
    <div data-map-degraded className={styles.overlayTr}>
      <div className={`${styles.mapPill} ${styles.degradedPill}`}>
        {/* The live region holds the text only, so the button's name is not read with it. */}
        <span role="status">{announce ? t('map_degraded_label') : ''}</span>
        <button
          type="button"
          className={styles.chipClose}
          aria-label={t('map_degraded_dismiss_aria')}
          onClick={() => {
            dismissedThisPage = true;
            setDismissed(true);
          }}
        >
          <Close width={14} height={14} />
        </button>
      </div>
    </div>
  );
}
