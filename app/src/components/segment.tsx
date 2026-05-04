// Segment — server component. Drive/walk/transit summary between two places.

import { Drive, Walk, Transit, GMaps, Help } from '@/components/icons';
import { gmapsDirectionsUrl } from '@/lib/gmaps';
import { SegmentModePicker } from '@/components/segment-mode-picker';
import styles from './itinerary-list.module.css';

type Place = {
  name: string;
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
  setModeAction?: (formData: FormData) => Promise<void>;
};

function ModeIcon({ mode }: { mode: Props['mode'] }) {
  if (mode === 'walk') return <Walk />;
  if (mode === 'transit') return <Transit />;
  return <Drive />;
}

function endpointMissing(p?: Place | null): boolean {
  return !p || p.lat == null || p.lng == null;
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
  setModeAction,
}: Props) {
  const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
  const showPicker =
    canEdit && setModeAction != null && dayId != null && idx != null;

  const travelmode =
    mode === 'walk' ? 'walking' : mode === 'transit' ? 'transit' : 'driving';
  const places = [from, to].filter((p): p is Place => p != null);
  const navUrl =
    places.length === 2 ? gmapsDirectionsUrl(places, travelmode) : null;

  const routeUnavailable = endpointMissing(from) || endpointMissing(to);

  if (routeUnavailable) {
    return (
      <div className={`${styles.segment} ${styles.segmentUnavailable}`}>
        <span className={styles.segIcon}>
          <Help />
        </span>
        <span className={styles.segMeta}>
          Route unavailable — Google Directions data missing.
        </span>
        {navUrl ? (
          <>
            <span className={styles.segSep}>·</span>
            <a
              className={styles.segNav}
              href={navUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GMaps />
              Retry on Google
            </a>
          </>
        ) : (
          <span className={styles.segSep} aria-hidden="true" />
        )}
      </div>
    );
  }

  return (
    <div className={styles.segment}>
      <span className={styles.segIcon}>
        <ModeIcon mode={mode} />
      </span>
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
        <>
          <span className={styles.segSep}>·</span>
          <a
            className={styles.segNav}
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <GMaps />
            Navigate
          </a>
        </>
      ) : (
        <span className={styles.segSep} aria-hidden="true" />
      )}
    </div>
  );
}
