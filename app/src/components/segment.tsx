// Segment — drive/walk/transit summary between two places.

import Link from 'next/link';
import { Drive, Walk, Transit, GMaps, MapPin } from '@/components/icons';
import { gmapsDirectionsUrl } from '@/lib/gmaps';
import { missingLocation } from '@/lib/segment-fix';
import { SegmentModePicker } from '@/components/segment-mode-picker';
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
  // A stale segment row after the last stop is a leg to nowhere.
  if (!from || !to) return null;

  const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
  const showPicker =
    canEdit && setModeAction != null && dayId != null && idx != null;

  const travelmode =
    mode === 'walk' ? 'walking' : mode === 'transit' ? 'transit' : 'driving';
  const navUrl = gmapsDirectionsUrl([from, to], travelmode);

  const missing = missingLocation(from, to, canEdit ? editHrefBase ?? null : null);

  if (missing) {
    return (
      <div className={styles.segment}>
        <span className={`${styles.segChip} ${styles.segChipUnavailable}`}>
          <span className={styles.segIcon}>
            <MapPin />
          </span>
          <span className={styles.segMeta}>
            <span>
              No location for <b>{missing.name}</b>
            </span>
          </span>
          {missing.fixHref ? (
            <Link className={`tp-hit ${styles.segNav}`} href={missing.fixHref}>
              Fix location
            </Link>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.segment}>
      <span className={`${styles.segChip} ${styles[`segMode_${mode}`]}`}>
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
                No transit route — tap Navigate
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
            <GMaps />
            Navigate
          </a>
        ) : null}
      </span>
    </div>
  );
}
