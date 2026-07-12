import { db } from '@/db';
import { days } from '@/db/schema';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function partsForDate(date: Date) {
  const dow = date.getDay();
  return {
    label: WEEKDAY_LABELS[dow],
    num: date.getDate(),
    dateLabel: `${WEEKDAY_FULL[dow]}, ${MONTH_FULL[date.getMonth()]} ${date.getDate()}`,
  };
}

export function parseISODate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Pure day-row field derivation shared by seedTripDays and the plan importer
// (API-IMPORT). With a date: weekday/day-number/pretty-date from the date,
// title "Day N". Without a date: neutral "Day N" placeholders (the day table's
// label/num/date columns are NOT NULL).
export function dayRowFields(
  idx: number,
  date: Date | null,
): { label: string; num: number; date: string; title: string } {
  if (date) {
    const p = partsForDate(date);
    return {
      label: p.label,
      num: p.num,
      date: p.dateLabel,
      title: `Day ${idx + 1}`,
    };
  }
  return {
    label: 'Day',
    num: idx + 1,
    date: `Day ${idx + 1}`,
    title: `Day ${idx + 1}`,
  };
}

export function expectedDayCount(
  startDate: string | null,
  endDate: string | null,
): number {
  if (!startDate || !endDate) return 0;
  const s = parseISODate(startDate);
  const e = parseISODate(endDate);
  if (!s || !e) return 0;
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}

// Insert day rows for [startDate, endDate] starting at idx=startIdx, dayOffset
// days after startDate. Used by trip creation and lazy backfill.
export async function seedTripDays(
  tripId: string,
  startDate: string,
  endDate: string,
  startIdx = 0,
  dayOffset = 0,
): Promise<number> {
  const total = expectedDayCount(startDate, endDate);
  const toCreate = total - dayOffset;
  if (toCreate <= 0) return 0;
  const start = parseISODate(startDate);
  if (!start) return 0;

  const rows: Array<typeof days.$inferInsert> = [];
  for (let i = 0; i < toCreate; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + dayOffset + i);
    const idx = startIdx + i;
    rows.push({ tripId, idx, ...dayRowFields(idx, d) });
  }
  await db.insert(days).values(rows);
  return rows.length;
}
