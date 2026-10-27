// One-shot plan import (API-IMPORT). Inserts trip → days → places → hotels →
// transport → expenses (+ splits) → notes, and the trip's budget/currency, in a
// SINGLE transaction via the postgres-js `dbNode` client (the neon-http `db`
// can't do interactive transactions). Any failure rolls the whole plan back, so
// a bad payload never leaves an orphan trip. No Google calls, no segments. The
// Wave-1 sections (TP-0040) arrive already validated on plan.sections.

import 'server-only';
import { eq } from 'drizzle-orm';
import { dbNode } from '@/db';
import {
  trips,
  days,
  places,
  hotelBookings,
  transportBookings,
  expenses,
  expenseSplits,
  notes,
} from '@/db/schema';
import { dayRowFields, parseISODate, expectedDayCount } from '@/lib/seed-days';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import type { IdemExecutor } from '@/lib/api/idempotency';

// The effective date for day index i: an explicit day.date, else startDate + i
// days, else null (neutral "Day N" labels).
function effectiveDate(
  dayDate: string | null,
  startDate: string | null,
  i: number,
): Date | null {
  if (dayDate) return parseISODate(dayDate);
  if (startDate) {
    const s = parseISODate(startDate);
    if (s) {
      const d = new Date(s);
      d.setDate(d.getDate() + i);
      return d;
    }
  }
  return null;
}

export async function importPlan(
  userId: string,
  plan: ParsedImportPlan,
  database: typeof dbNode = dbNode,
  recordCompletion?: (tx: IdemExecutor, tripId: string) => Promise<void>,
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const [trip] = await tx
      .insert(trips)
      .values({
        ownerId: userId,
        title: plan.trip.title,
        subtitle: plan.trip.subtitle,
        startDate: plan.trip.startDate,
        endDate: plan.trip.endDate,
        cover: plan.trip.cover,
        sourceUrl: plan.trip.sourceUrl ?? null,
      })
      .returning({ id: trips.id });

    // Explicit payload days, or (when none) seed the date-range skeleton so a
    // dated trip still gets its days, matching normal trip creation.
    let dayInputs = plan.days;
    if (dayInputs.length === 0 && plan.trip.startDate && plan.trip.endDate) {
      const n = expectedDayCount(plan.trip.startDate, plan.trip.endDate);
      dayInputs = Array.from({ length: n }, () => ({ date: null, places: [] }));
    }

    for (let i = 0; i < dayInputs.length; i++) {
      const di = dayInputs[i];
      const date = effectiveDate(di.date, plan.trip.startDate, i);
      const [day] = await tx
        .insert(days)
        .values({ tripId: trip.id, idx: i, ...dayRowFields(i, date) })
        .returning({ id: days.id });

      for (let j = 0; j < di.places.length; j++) {
        await tx.insert(places).values({ ...di.places[j], dayId: day.id, idx: j });
      }
    }

    for (const hotel of plan.hotels) {
      await tx
        .insert(hotelBookings)
        .values({ ...hotel, tripId: trip.id, name: hotel.name });
    }

    // Wave-1 sections (TP-0040). Already validated by parseImportPlan, so these
    // are passthrough inserts in the SAME tx — all-or-nothing with the trip.
    const sections = plan.sections;
    if (sections) {
      for (const t of sections.transport) {
        await tx.insert(transportBookings).values({ ...t, tripId: trip.id });
      }

      for (const e of sections.expenses) {
        const [row] = await tx
          .insert(expenses)
          .values({ ...e.values, tripId: trip.id })
          .returning({ id: expenses.id });
        if (e.splits && e.splits.length > 0) {
          await tx.insert(expenseSplits).values(
            e.splits.map((s) => ({
              expenseId: row.id,
              accountId: s.accountId,
              shareAmount: s.shareAmount ?? null,
              sharePct: s.sharePct ?? null,
            })),
          );
        }
      }

      // Notes are ordered by idx; a fresh trip starts the sequence at 0.
      for (let i = 0; i < sections.notes.length; i++) {
        await tx.insert(notes).values({ ...sections.notes[i], tripId: trip.id, idx: i });
      }

      // Budget config + comparison currency both live on the trip row.
      if (sections.budget) {
        const patch: Record<string, unknown> = {};
        if (sections.budget.config !== null) patch.budgetConfig = sections.budget.config;
        if (sections.budget.currency !== null) patch.currency = sections.budget.currency;
        if (Object.keys(patch).length > 0) {
          await tx.update(trips).set(patch).where(eq(trips.id, trip.id));
        }
      }
    }

    if (recordCompletion) await recordCompletion(tx, trip.id);
    return { id: trip.id };
  });
}
