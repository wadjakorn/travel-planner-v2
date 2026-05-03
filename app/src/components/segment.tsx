// Segment — server component. Drive/walk/transit summary between two places.
// Ported from design/place-row.jsx Segment function.

import { Drive, Walk, Transit, GMaps } from '@/components/icons';
import { gmapsDirectionsUrl } from '@/lib/gmaps';
import styles from './itinerary-list.module.css';

type Place = { name: string; address?: string | null };

type Props = {
  mode: 'drive' | 'walk' | 'transit';
  distance: string;
  time: string;
  from?: Place | null;
  to?: Place | null;
};

function ModeIcon({ mode }: { mode: Props['mode'] }) {
  if (mode === 'walk') return <Walk />;
  if (mode === 'transit') return <Transit />;
  return <Drive />;
}

export function Segment({ mode, distance, time, from, to }: Props) {
  const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);

  const travelmode =
    mode === 'walk' ? 'walking' : mode === 'transit' ? 'transit' : 'driving';
  const places = [from, to].filter((p): p is Place => p != null);
  const navUrl =
    places.length === 2 ? gmapsDirectionsUrl(places, travelmode) : null;

  return (
    <div className={styles.segment}>
      <span className={styles.segIcon}>
        <ModeIcon mode={mode} />
      </span>
      <span className={styles.segMeta}>
        {modeLabel} · {distance} · {time}
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
