import Link from 'next/link';
import { Route, Clock, GMaps, Plus } from '@/components/icons';
import styles from './itinerary-sidebar.module.css';

type Day = {
  id: string;
  idx: number;
  label: string;
  num: number;
};

type Props = {
  days: Day[];
  activeIdx: number;
  activeDay: {
    title: string;
    summaryDistance?: string | null;
    summaryTime?: string | null;
  };
  tripId: string;
};

export function DayHeader({ days, activeIdx, activeDay, tripId }: Props) {
  return (
    <div>
      {/* Day chips strip */}
      <div className={styles.dayChips}>
        {days.map((day) => (
          <Link
            key={day.id}
            href={`/trip/${tripId}?day=${day.idx}`}
            className={
              day.idx === activeIdx
                ? `${styles.dayChip} ${styles.dayChipActive}`
                : styles.dayChip
            }
          >
            <span className={styles.dayChipLabel}>{day.label}</span>
            <span className={styles.dayChipNum}>{day.num}</span>
          </Link>
        ))}
        {/* Add day — no onClick in this slice */}
        <button
          className={styles.dayChipAdd}
          type="button"
          disabled
          title="Add day"
          aria-label="Add day"
        >
          <Plus width={14} height={14} />
        </button>
      </div>

      {/* Active day title + summary */}
      <div className={styles.dayHdr}>
        <h2 className={styles.dayTitle}>{activeDay.title}</h2>
        <button className={styles.openMapsBtn} type="button" title="Open in Google Maps">
          <GMaps />
          Open in Maps
        </button>
      </div>

      {(activeDay.summaryDistance || activeDay.summaryTime) && (
        <div className={styles.daySummary}>
          {activeDay.summaryDistance && (
            <span>
              <Route />
              {activeDay.summaryDistance}
            </span>
          )}
          {activeDay.summaryTime && (
            <span>
              <Clock />
              {activeDay.summaryTime}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
