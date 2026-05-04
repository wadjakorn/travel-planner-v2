import Link from 'next/link';
import { Route, Clock, Plus, Trash } from '@/components/icons';
import { addDayAction, removeDayAction } from '@/app/actions/days';
import { setDayDefaultModeAction } from '@/app/actions/segments';
import { DayModePicker } from '@/components/day-mode-picker';
import { PendingButton } from '@/components/spinner';
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
    dateLabel?: string | null;
    summaryDistance?: string | null;
    summaryTime?: string | null;
    defaultMode?: 'drive' | 'walk' | 'transit' | null;
  };
  tripId: string;
  canEdit?: boolean;
  hasDateRange?: boolean;
  hideChips?: boolean;
  hideBlock?: boolean;
};

export function DayHeader({
  days,
  activeIdx,
  activeDayId,
  activeDay,
  tripId,
  canEdit = true,
  hasDateRange = false,
  hideChips = false,
  hideBlock = false,
}: Props) {
  return (
    <div>
      {hideChips ? null : (
      /* Day chips strip */
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
        {canEdit && !hasDateRange ? (
          <form action={addDayAction}>
            <input type="hidden" name="tripId" value={tripId} />
            <PendingButton
              className={styles.dayChipAdd}
              title="Add day"
              aria-label="Add day"
              spinnerSize={14}
            >
              <Plus width={14} height={14} />
            </PendingButton>
          </form>
        ) : null}
      </div>
      )}

      {hideBlock ? null : (
      /* Active day title + summary */
      <div className={styles.dayBlock}>
        <div className={styles.dayHdr}>
          <h2 className={styles.dayTitle}>
            {activeDay.title}
            {activeDay.dateLabel ? (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#86868b',
                  marginLeft: 10,
                }}
              >
                {activeDay.dateLabel}
              </span>
            ) : null}
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canEdit && activeDayId ? (
              <DayModePicker
                dayId={activeDayId}
                defaultMode={activeDay.defaultMode ?? null}
                setDayDefaultModeAction={setDayDefaultModeAction}
              />
            ) : null}
            {canEdit && !hasDateRange && activeDayId && days.length > 1 ? (
              <form action={removeDayAction}>
                <input type="hidden" name="dayId" value={activeDayId} />
                <PendingButton
                  className={styles.openMapsBtn}
                  title="Remove this day"
                  aria-label="Remove day"
                  spinnerSize={14}
                >
                  <Trash />
                </PendingButton>
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
      )}
    </div>
  );
}
