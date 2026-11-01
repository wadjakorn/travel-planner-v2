'use client';

// Segment — drive/walk/transit summary between two places.

import Link from 'next/link';
import { Drive, Walk, Transit, NavArrow, MapPin } from '@/components/icons';
import { gmapsDirectionsUrl, travelMode } from '@/lib/gmaps';
import { missingLocation } from '@/lib/segment-fix';
import { SegmentModePicker } from '@/components/segment-mode-picker';
import { useT } from '@/components/i18n-provider';
import type { MessageKey } from '@/lib/i18n-client';
import styles from './itinerary-list.module.css';

type Place = {
  id: string;
  name: string;
  editHref?: string;
  synthetic?: boolean;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeIdExternal?: string | null;
};

type Props = {
  mode: 'drive' | 'walk' | 'transit';
  distance: string;
  time: string;
  from?: Place | null;
  to?: Place | null;
  dayId?: string;
  idx?: number;
  canEdit?: boolean;
  editHrefBase?: string; // place edit route base, for the "Fix location" link
  setModeAction?: (formData: FormData) => Promise<void>;
};

const MODE_LABEL: Record<Props['mode'], MessageKey> = {
  drive: 'itin_mode_drive',
  walk: 'itin_mode_walk',
  transit: 'itin_mode_transit',
};

function ModeIcon({ mode }: { mode: Props['mode'] }) {
  if (mode === 'walk') return <Walk />;
  if (mode === 'transit') return <Transit />;
  return <Drive />;
}

export function Segment({
  mode,
  distance,
  time,
  from,
  to,
  dayId,
  idx,
  canEdit = false,
  editHrefBase,
  setModeAction,
}: Props) {
  const t = useT();
  // A stale segment row after the last stop is a leg to nowhere.
  if (!from || !to) return null;

  const modeLabel = t(MODE_LABEL[mode]);
  const showPicker =
    canEdit && setModeAction != null && dayId != null && idx != null;

  const navUrl = gmapsDirectionsUrl([from, to], travelMode(mode));

  const missing = missingLocation(from, to, canEdit ? editHrefBase ?? null : null);

  if (missing) {
    // One sentence; split around {name} so the name can be bold.
    const [beforeName, afterName = ''] = t('itin_segment_no_location').split('{name}');
    return (
      <div className={styles.segment}>
        <span className={`${styles.segChip} ${styles.segChipUnavailable}`}>
          <span className={styles.segIcon}>
            <MapPin />
          </span>
          <span className={styles.segMeta}>
            <span>
              {beforeName}
              <b>{missing.name}</b>
              {afterName}
            </span>
          </span>
          {missing.fixHref ? (
            <Link className={`tp-hit ${styles.segNav}`} href={missing.fixHref}>
              {t('itin_segment_fix_location')}
            </Link>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.segment}>
      <span className={styles.segChip}>
        {showPicker ? null : (
          <span className={styles.segIcon}>
            <ModeIcon mode={mode} />
          </span>
        )}
        <span className={styles.segMeta}>
          {showPicker ? (
            <SegmentModePicker
              dayId={dayId!}
              idx={idx!}
              mode={mode}
              setModeAction={setModeAction!}
            />
          ) : (
            <>{modeLabel}</>
          )}
          {distance || time ? (
            <>
              {' · '}
              {[distance, time].filter(Boolean).join(' · ')}
            </>
          ) : mode === 'transit' ? (
            <>
              {' · '}
              <span className={styles.segHint}>
                {t('itin_segment_no_transit')}
              </span>
            </>
          ) : null}
        </span>
        {navUrl ? (
          <a
            className={`tp-hit ${styles.segNav}`}
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <NavArrow aria-hidden fill="currentColor" />
            {t('itin_segment_navigate')}
          </a>
        ) : null}
      </span>
    </div>
  );
}
