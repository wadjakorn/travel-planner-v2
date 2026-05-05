'use server';

// Day CRUD server actions. Slice 2C ships add + remove. Reorder lands
// in slice 2E with the drag/drop work.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { requireUserId } from '@/lib/with-trip-auth';
import { db } from '@/db';
import { days, trips } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';
import { trimOrNull } from '@/lib/form-parsers';

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

async function ownsTrip(userId: string, tripId: string): Promise<boolean> {
  return canWrite(await getTripRole(tripId, userId));
}

export async function addDayAction(formData: FormData) {
  const userId = await requireUserId();

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');
  if (!(await ownsTrip(userId, tripId))) throw new Error('Forbidden');

  // Derive idx + date from current last day, falling back to trip startDate.
  const last = await db
    .select()
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(desc(days.idx))
    .limit(1);

  let nextDate: Date;
  if (last[0]) {
    const parts = last[0].date.match(/(\w+) (\d+)$/);
    // The "date" column stores a label; if we ever lose a parseable form
    // we fall back to today. Phase 2D/E will normalise to ISO.
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

  revalidatePath(`/trip/${tripId}`);
  redirect(`/trip/${tripId}?day=${nextIdx}`);
}

export async function removeDayAction(formData: FormData) {
  const userId = await requireUserId();

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');

  const dayRow = await db
    .select()
    .from(days)
    .where(eq(days.id, dayId))
    .limit(1);
  const day = dayRow[0];
  if (!day) throw new Error('Day not found');

  if (!(await ownsTrip(userId, day.tripId)))
    throw new Error('Forbidden');

  // Cascade delete drops places + segments via FK onDelete: cascade.
  await db.delete(days).where(eq(days.id, dayId));

  // Re-index remaining days so idx stays contiguous.
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

  revalidatePath(`/trip/${day.tripId}`);
  // Stay on the trip; jump to the day before the deleted one (or 0).
  const targetIdx = Math.max(0, day.idx - 1);
  redirect(`/trip/${day.tripId}?day=${targetIdx}`);
}
