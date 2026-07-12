// One-shot plan import (API-IMPORT). Inserts trip → days → places → hotels in a
// SINGLE transaction via the postgres-js `dbNode` client (the neon-http `db`
// can't do interactive transactions). Any failure rolls the whole plan back, so
// a bad payload never leaves an orphan trip. No Google calls, no segments.

import 'server-only';
import { dbNode } from '@/db';
import { trips, days, places, hotelBookings } from '@/db/schema';
import { dayRowFields, parseISODate, expectedDayCount } from '@/lib/seed-days';
import type { ParsedImportPlan } from '@/lib/api/import-input';

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

    return { id: trip.id };
  });
}
