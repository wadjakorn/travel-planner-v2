// Day mutation service. Framework-agnostic — see trip-service.ts.

import { and, desc, eq, gte, gt, lt, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db, dbNode } from '@/db';
import { days, expenses, hotelBookings, transportBookings, trips } from '@/db/schema';
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

// Date fields to rewrite after removeDay() repacks idx (TP-0055). A survivor
// that slid from idx N to N-1 now sits on startDate + (N-1), so its machine date
// and display must follow. Without a trip start date there is nothing to derive
// from — any date_iso the import wrote explicitly stays with its day's content.
// Pure, so the shift arithmetic is unit-tested without a database.
export function rederiveShiftedDays(
  startDate: string | null,
  survivors: { id: string; idx: number }[],
): { id: string; dateIso: string | null; label: string; num: number; date: string }[] {
  if (!startDate) return [];
  return survivors.map((d) => ({ id: d.id, ...deriveDayDate(startDate, d.idx) }));
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
//
// TP-0155: one dbNode transaction, trip days locked ORDER BY idx (the same
// order as PUT /trips/:id/plan), and the positional day references follow:
// expense / hotel / undated ride on a later day -> dayIdx - 1, on the removed
// day -> null. A ride with a fromDate (trip has a startDate) -> null, so it is
// placed by its own date (rideOnDay) instead of a shifted index whose date
// was just re-derived. Soft-deleted rows shift too (restore must not revive a
// stale index).
export async function removeDay(
  userId: string,
  dayId: string,
  txDb: typeof dbNode = dbNode,
): Promise<{ tripId: string; targetIdx: number }> {
  const day = await txDb.transaction(async (tx) => {
    const [found] = await tx.select().from(days).where(eq(days.id, dayId)).limit(1);
    if (!found) throw new ServiceError('not_found', 'Day not found');
    await resolveDayWrite(userId, dayId, tx);
    await tx.execute(sql`SELECT id FROM day WHERE trip_id = ${found.tripId} ORDER BY idx FOR UPDATE`);
    const [trip] = await tx
      .select({ startDate: trips.startDate })
      .from(trips)
      .where(eq(trips.id, found.tripId))
      .limit(1);

    // Cascade delete drops places + segments via FK onDelete: cascade.
    await tx.delete(days).where(eq(days.id, dayId));

    // Two-phase shift: Postgres checks the unique (trip_id, idx) index row by
    // row, so a single `idx - 1` UPDATE collides depending on physical row
    // order. Park the survivors at negative idx first, then flip them back.
    await tx
      .update(days)
      .set({ idx: sql`-${days.idx}` })
      .where(and(eq(days.tripId, found.tripId), gt(days.idx, found.idx)));
    await tx
      .update(days)
      .set({ idx: sql`-${days.idx} - 1` })
      .where(and(eq(days.tripId, found.tripId), lt(days.idx, 0)));

    // Re-derive the shifted survivors' dates from trips.startDate.
    const shifted = await tx
      .select({ id: days.id, idx: days.idx })
      .from(days)
      .where(and(eq(days.tripId, found.tripId), gte(days.idx, found.idx)));
    for (const u of rederiveShiftedDays(trip?.startDate || null, shifted)) {
      await tx
        .update(days)
        .set({ dateIso: u.dateIso, label: u.label, num: u.num, date: u.date })
        .where(eq(days.id, u.id));
    }

    // Positional references (TP-0155).
    const k = found.idx;
    const shiftRef = (col: AnyPgColumn) =>
      sql`CASE WHEN ${col} = ${k} THEN NULL WHEN ${col} > ${k} THEN ${col} - 1 ELSE ${col} END`;
    await tx
      .update(expenses)
      .set({ dayIdx: shiftRef(expenses.dayIdx) })
      .where(and(eq(expenses.tripId, found.tripId), gte(expenses.dayIdx, k)));
    await tx
      .update(hotelBookings)
      .set({ dayIdx: shiftRef(hotelBookings.dayIdx) })
      .where(and(eq(hotelBookings.tripId, found.tripId), gte(hotelBookings.dayIdx, k)));
    const dated = trip?.startDate
      ? sql`${transportBookings.fromDate} IS NOT NULL AND ${transportBookings.fromDate} <> ''`
      : sql`false`;
    await tx
      .update(transportBookings)
      .set({
        dayIdx: sql`CASE WHEN ${dated} THEN NULL ELSE ${shiftRef(transportBookings.dayIdx)} END`,
      })
      .where(and(eq(transportBookings.tripId, found.tripId), gte(transportBookings.dayIdx, k)));

    await touchTrip(found.tripId, tx);
    return found;
  });
  await writeAudit({
    tripId: day.tripId,
    userId,
    action: 'remove',
    entityType: 'day',
    entityId: dayId,
  });

  return { tripId: day.tripId, targetIdx: Math.max(0, day.idx - 1) };
}
