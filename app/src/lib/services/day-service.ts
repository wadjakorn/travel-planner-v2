// Day mutation service. Framework-agnostic — see trip-service.ts.

import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { days, trips } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
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

// Append a day at the end of a trip, deriving its date from the current
// last day (falling back to trip startDate, then today).
export async function addDay(
  userId: string,
  tripId: string,
): Promise<{ id: string; idx: number }> {
  await assertTripWrite(userId, tripId);

  const last = await db
    .select()
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(desc(days.idx))
    .limit(1);

  let nextDate: Date;
  if (last[0]) {
    const parts = last[0].date.match(/(\w+) (\d+)$/);
    const start = parts
      ? new Date(`${parts[1]} ${parts[2]}, ${new Date().getFullYear()}`)
      : new Date();
    nextDate = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  } else {
    const trip = await db
      .select({ startDate: trips.startDate })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    nextDate = trip[0]?.startDate ? new Date(trip[0].startDate) : new Date();
  }

  const nextIdx = (last[0]?.idx ?? -1) + 1;
  const parts = formatDayParts(nextDate);

  const [created] = await db
    .insert(days)
    .values({
      tripId,
      idx: nextIdx,
      label: parts.label,
      num: parts.num,
      date: parts.dateLabel,
      title: `Day ${nextIdx + 1}`,
    })
    .returning({ id: days.id });
  await touchTrip(tripId);
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
