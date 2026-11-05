'use client';

// Segment — the one-line leg bar between two places in the itinerary list.
// The bar's body is a button that opens the shared leg sheet
// (leg-sheet-context.tsx); Navigate / Fix location are sibling links (never a
// link inside the button). The sheet itself decides read-only from canEdit.

import { useId } from 'react';
import Link from 'next/link';
import { Drive, Walk, Transit, NavArrow, MapPin, Note } from '@/components/icons';
import { gmapsDirectionsUrl, travelMode } from '@/lib/gmaps';
import { missingLocation } from '@/lib/segment-fix';
import { segmentTimeText } from '@/lib/segment-label';
import { useLegSheet } from '@/components/leg-sheet-context';
import { useT } from '@/components/i18n-provider';
import type { MessageKey } from '@/lib/i18n-client';
import type { LegInfo } from '@/lib/leg-info';
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
  leg: LegInfo;
  /** No opening the sheet (a reorder is in flight, or an editor's list has not hydrated yet). */
  disabled?: boolean;
  canEdit?: boolean;
  editHrefBase?: string; // place edit route base, for the "Fix location" link
};

const MODE_LABEL: Record<Props['mode'], MessageKey> = {
  drive: 'itin_mode_drive',
  walk: 'itin_mode_walk',
  transit: 'itin_mode_transit',
};

function ModeIcon({ mode }: { mode: Props['mode'] }) {
  if (mode === 'walk') return <Walk aria-hidden />;
  if (mode === 'transit') return <Transit aria-hidden />;
  return <Drive aria-hidden />;
}

export function Segment({
  mode,
  distance,
  time,
  note,
  durationMin,
  from,
  to,
  leg,
  disabled = false,
  canEdit = false,
  editHrefBase,
}: Props) {
  const t = useT();
  const { openLeg } = useLegSheet();
  const describedBy = useId();
  // A stale segment row after the last stop is a leg to nowhere.
  if (!from || !to) return null;

  // The local order (after an optimistic reorder) can run ahead of the
  // server's legs: never open another leg's sheet.
  const matches = leg.fromId === from.id && leg.toId === to.id;
  const buttonProps = {
    type: 'button' as const,
    'aria-describedby': describedBy,
    onClick: () => openLeg(leg, 'list'),
    disabled: disabled || !matches,
  };
  const describe = (
    <span id={describedBy} className="sr-only">
      {t('leg_open_aria', { from: leg.from.name, to: leg.to.name })}
    </span>
  );
  const noteMark = note ? (
    <span className={styles.segNoteMark}>
      <Note aria-hidden />
      <span className="sr-only">{t('leg_has_note')}</span>
    </span>
  ) : null;

  const missing = missingLocation(from, to, canEdit ? editHrefBase ?? null : null);

  if (missing) {
    // One sentence; split around {name} so the name can be bold.
    const [beforeName, afterName = ''] = t('itin_segment_no_location').split('{name}');
    return (
      <div className={styles.segment}>
        <button
          {...buttonProps}
          className={`tp-hit ${styles.segChip} ${styles.segBar} ${styles.segChipUnavailable}`}
        >
          <span className={styles.segIcon}>
            <MapPin aria-hidden />
          </span>
          <span className={styles.segMeta}>
            <span>
              {beforeName}
              <b>{missing.name}</b>
              {afterName}
            </span>
          </span>
          {noteMark}
        </button>
        {missing.fixHref ? (
          <Link className={`tp-hit ${styles.segNav}`} href={missing.fixHref}>
            {t('itin_segment_fix_location')}
          </Link>
        ) : null}
        {describe}
      </div>
    );
  }

  const timeText = segmentTimeText(time, durationMin, (d) =>
    t('itin_segment_duration_approx', { duration: d }),
  );
  const meta = [t(MODE_LABEL[mode]), distance, timeText].filter(Boolean).join(' · ');
  const navUrl = gmapsDirectionsUrl([from, to], travelMode(mode));

  return (
    <div className={`${styles.segment} ${styles.segOneLine}`}>
      <button {...buttonProps} className={`tp-hit ${styles.segChip} ${styles.segBar}`}>
        <span className={styles.segIcon}>
          <ModeIcon mode={mode} />
        </span>
        <span className={styles.segMetaText}>{meta}</span>
        {noteMark}
      </button>
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
      {describe}
    </div>
  );
}
