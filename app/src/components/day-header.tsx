import Link from 'next/link';
import { Route, Clock, Plus, Trash } from '@/components/icons';
import { addDayAction, removeDayAction } from '@/app/actions/days';
import { setDayDefaultModeAction } from '@/app/actions/segments';
import { DayModePicker } from '@/components/day-mode-picker';
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
  activeDayId?: string;
  activeDay: {
    title: string;
    summaryDistance?: string | null;
    summaryTime?: string | null;
    defaultMode?: 'drive' | 'walk' | 'transit' | null;
  };
  tripId: string;
  canEdit?: boolean;
};

export function DayHeader({
  days,
  activeIdx,
  activeDayId,
  activeDay,
  tripId,
  canEdit = true,
}: Props) {
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
        {/* Add day */}
        {canEdit ? (
          <form action={addDayAction}>
            <input type="hidden" name="tripId" value={tripId} />
            <button
              className={styles.dayChipAdd}
              type="submit"
              title="Add day"
              aria-label="Add day"
            >
              <Plus width={14} height={14} />
            </button>
          </form>
        ) : null}
      </div>

      {/* Active day title + summary */}
      <div className={styles.dayBlock}>
        <div className={styles.dayHdr}>
          <h2 className={styles.dayTitle}>{activeDay.title}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canEdit && activeDayId ? (
              <DayModePicker
                dayId={activeDayId}
                defaultMode={activeDay.defaultMode ?? null}
                setDayDefaultModeAction={setDayDefaultModeAction}
              />
            ) : null}
            {canEdit && activeDayId && days.length > 1 ? (
              <form action={removeDayAction}>
                <input type="hidden" name="dayId" value={activeDayId} />
                <button
                  type="submit"
                  className={styles.openMapsBtn}
                  title="Remove this day"
                  aria-label="Remove day"
                >
                  <Trash />
                </button>
              </form>
            ) : null}
          </div>
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
    </div>
  );
}
