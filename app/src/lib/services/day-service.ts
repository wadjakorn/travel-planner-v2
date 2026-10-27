// Day mutation service. Framework-agnostic — see trip-service.ts.

import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { days, trips } from '@/db/schema';
import { addDaysIso } from '@/lib/calendar-queries';
import { parseISODate } from '@/lib/seed-days';
import { touchTrip } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { ServiceError } from './service-error';
import { assertTripWrite, resolveDayWrite } from './access';

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

function formatDayParts(date: Date): {
  label: string;
  num: number;
  dateLabel: string;
} {
  const dow = date.getDay();
  return {
    label: WEEKDAY_LABELS[dow],
    num: date.getDate(),
    dateLabel: `${WEEKDAY_FULL[dow]}, ${MONTH_FULL[date.getMonth()]} ${date.getDate()}`,
  };
}

// Day date fields for the day at 0-based `idx` of a trip starting on
// `startDate` (ISO YYYY-MM-DD). The machine date is startDate + idx via
// addDaysIso; the display string is derived from that same date, NOT by
// reverse-parsing a previous day's label (which had no year and silently
// assumed the current one — the TP-0037 bug). Without a start date the machine
// date is null (we never guess a year) and the display falls back to today so
// the UI still shows a real date. Pure: the single source for the add path.
export function deriveDayDate(
  startDate: string | null,
  idx: number,
): { dateIso: string | null; label: string; num: number; date: string } {
  const dateIso = startDate ? addDaysIso(startDate, idx) : null;
  const date = dateIso ? (parseISODate(dateIso) ?? new Date()) : new Date();
  const parts = formatDayParts(date);
  return { dateIso, label: parts.label, num: parts.num, date: parts.dateLabel };
}

// Append a day at the end of a trip. The real date is trips.startDate + idx:
// idx is 0-based and removeDay() repacks it to stay contiguous, so appending
// at idx = lastIdx + 1 lands on the right calendar day. date_iso stores that
// machine date (null when the trip has no start date — we never guess a year).
export async function addDay(
  userId: string,
  tripId: string,
  exec: IdemExecutor = db,
): Promise<{ id: string; idx: number }> {
  await assertTripWrite(userId, tripId, exec);

  const last = await exec
    .select({ idx: days.idx })
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(desc(days.idx))
    .limit(1);

  const trip = await exec
    .select({ startDate: trips.startDate })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);

  const nextIdx = (last[0]?.idx ?? -1) + 1;
  const { dateIso, label, num, date } = deriveDayDate(
    trip[0]?.startDate || null,
    nextIdx,
  );

  const [created] = await (exec as typeof db)
    .insert(days)
    .values({
      tripId,
      idx: nextIdx,
      label,
      num,
      date,
      dateIso,
      title: `Day ${nextIdx + 1}`,
    })
    .returning({ id: days.id });
  await touchTrip(tripId, exec);
  await writeAudit({
    tripId,
    userId,
    action: 'add',
    entityType: 'day',
    entityId: created.id,
    after: { idx: nextIdx },
  });

  return { id: created.id, idx: nextIdx };
}

// Remove a day and re-index the survivors so idx stays contiguous.
// Returns the trip id and the day to focus next.
export async function removeDay(
  userId: string,
  dayId: string,
): Promise<{ tripId: string; targetIdx: number }> {
  const dayRow = await db
    .select()
    .from(days)
    .where(eq(days.id, dayId))
    .limit(1);
  const day = dayRow[0];
  if (!day) throw new ServiceError('not_found', 'Day not found');

  await resolveDayWrite(userId, dayId);

  // Cascade delete drops places + segments via FK onDelete: cascade.
  await db.delete(days).where(eq(days.id, dayId));

  await db
    .update(days)
    .set({ idx: sql`${days.idx} - 1` })
    .where(and(eq(days.tripId, day.tripId), gt(days.idx, day.idx)));
  await touchTrip(day.tripId);
  await writeAudit({
    tripId: day.tripId,
    userId,
    action: 'remove',
    entityType: 'day',
    entityId: dayId,
  });

  return { tripId: day.tripId, targetIdx: Math.max(0, day.idx - 1) };
}
