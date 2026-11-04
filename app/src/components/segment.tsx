'use client';

// Segment — drive/walk/transit summary between two places.

import { useState } from 'react';
import Link from 'next/link';
import { Drive, Walk, Transit, NavArrow, MapPin } from '@/components/icons';
import { gmapsDirectionsUrl, travelMode } from '@/lib/gmaps';
import { formatDurationMin } from '@/lib/units';
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
  note?: string | null;
  durationMin?: number | null;
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
  note,
  durationMin,
  from,
  to,
  dayId,
  idx,
  canEdit = false,
  editHrefBase,
  setModeAction,
}: Props) {
  const t = useT();
  const [noteOpen, setNoteOpen] = useState(false);
  // A stale segment row after the last stop is a leg to nowhere.
  if (!from || !to) return null;

  const modeLabel = t(MODE_LABEL[mode]);
  const showPicker =
    canEdit && setModeAction != null && dayId != null && idx != null;

  // A stored `time` wins over the leg's estimated duration.
  const approx =
    durationMin != null
      ? t('itin_segment_duration_approx', { duration: formatDurationMin(durationMin) })
      : '';

  const navUrl = gmapsDirectionsUrl([from, to], travelMode(mode));

  const missing = missingLocation(from, to, canEdit ? editHrefBase ?? null : null);

  // Shown on a "No location" leg too: the note is often the only travel info.
  const noteEl = note ? (
    <button
      type="button"
      className={styles.segNote}
      aria-expanded={noteOpen}
      onClick={() => setNoteOpen((o) => !o)}
    >
      <span className={styles.segNoteText}>{note}</span>
    </button>
  ) : null;

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
        {noteEl}
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
          {distance || time || approx ? (
            <>
              {' · '}
              {[distance, time || approx].filter(Boolean).join(' · ')}
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
      {noteEl}
    </div>
  );
}
