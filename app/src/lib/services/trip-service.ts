// Trip mutation service. Framework-agnostic: takes an acting-user id +
// typed input, no FormData / redirect / revalidate. Called by the trip
// server actions today and the REST API (ticket API-B) tomorrow.

import { and, asc, eq } from 'drizzle-orm';
import { db, dbNode } from '@/db';
import { trips, days } from '@/db/schema';
import {
  seedTripDays,
  expectedDayCount,
  parseISODate,
  dayRowFields,
} from '@/lib/seed-days';
import { touchTrip } from '@/lib/touch-trip';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { ServiceError } from './service-error';
import { assertTripWrite } from './access';

export type CreateTripInput = {
  title: string | null;
  subtitle?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  cover?: string | null;
};

export async function createTrip(
  userId: string,
  input: CreateTripInput,
  exec: IdemExecutor = db,
): Promise<{ id: string }> {
  const title = input.title;
  if (!title) throw new ServiceError('bad_request', 'Title is required');

  const [row] = await (exec as typeof db)
    .insert(trips)
    .values({
      ownerId: userId,
      title,
      subtitle: input.subtitle ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      cover: input.cover ?? null,
    })
    .returning({ id: trips.id });

  if (input.startDate && input.endDate) {
    await seedTripDays(row.id, input.startDate, input.endDate, 0, 0, exec);
  }

  return { id: row.id };
}

export type UpdateTripInput = {
  title?: string;
  subtitle?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  cover?: string | null;
};

async function loadTripRows(exec: IdemExecutor, tripId: string) {
  return (exec as typeof db)
    .select()
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(asc(days.idx));
}

function validateIsoDate(value: string | null, label: string): void {
  if (value !== null && value !== '' && !parseISODate(value)) {
    throw new ServiceError(
      'bad_request',
      `${label} must be a valid YYYY-MM-DD date`,
    );
  }
}

async function syncTripDays(
  exec: IdemExecutor,
  tripId: string,
  startDate: string | null,
  endDate: string | null,
): Promise<void> {
  if (!startDate || !endDate) return;

  const start = parseISODate(startDate);
  if (!start) {
    throw new ServiceError('bad_request', 'Start date must be valid');
  }

  const rows = await loadTripRows(exec, tripId);
  for (const row of rows) {
    const d = new Date(start);
    d.setDate(d.getDate() + row.idx);
    await (exec as typeof db)
      .update(days)
      .set({ ...dayRowFields(row.idx, d) })
      .where(eq(days.id, row.id));
  }

  const nextIdx = rows.reduce((max, row) => Math.max(max, row.idx), -1) + 1;
  await seedTripDays(tripId, startDate, endDate, nextIdx, nextIdx, exec);
}

// Patch a trip's header fields. Only keys present in `input` are written.
// Requires write access (owner or editor).
export async function updateTrip(
  userId: string,
  tripId: string,
  input: UpdateTripInput,
): Promise<{ tripId: string }> {
  await assertTripWrite(userId, tripId);

  // neon-http has no interactive transactions — every other transactional
  // writer in this codebase uses dbNode (postgres-js over TCP) for the same
  // reason. db.transaction() typechecks and then throws at runtime.
  await dbNode.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);
    if (!current) throw new ServiceError('not_found', 'Trip not found');

    const nextStart =
      input.startDate !== undefined ? input.startDate : current.startDate;
    const nextEnd =
      input.endDate !== undefined ? input.endDate : current.endDate;

    validateIsoDate(nextStart, 'Start date');
    validateIsoDate(nextEnd, 'End date');

    if (nextStart && nextEnd && nextEnd < nextStart) {
      throw new ServiceError(
        'bad_request',
        'End date must be on or after the start date',
      );
    }

    const currentLength = expectedDayCount(current.startDate, current.endDate);
    const nextLength = expectedDayCount(nextStart, nextEnd);
    if (nextLength < currentLength) {
      throw new ServiceError(
        'bad_request',
        'This change would shorten the trip and drop existing days or bookings. Keep the current range or expand it first.',
      );
    }

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) {
      if (!input.title.trim()) {
        throw new ServiceError('bad_request', 'Title cannot be empty');
      }
      patch.title = input.title.trim();
    }
    if (input.subtitle !== undefined) patch.subtitle = input.subtitle;
    if (input.startDate !== undefined) patch.startDate = input.startDate;
    if (input.endDate !== undefined) patch.endDate = input.endDate;
    if (input.cover !== undefined) patch.cover = input.cover;

    if (Object.keys(patch).length > 0) {
      await tx.update(trips).set(patch).where(eq(trips.id, tripId));
    }

    if (nextLength > 0) {
      await syncTripDays(tx, tripId, nextStart, nextEnd);
    }
    await touchTrip(tripId, tx);
  });

  return { tripId };
}

// Soft-delete, owner-scoped (a non-owner match simply affects no rows).
export async function deleteTrip(
  userId: string,
  tripId: string,
): Promise<void> {
  await db
    .update(trips)
    .set({ deletedAt: new Date() })
    .where(and(eq(trips.id, tripId), eq(trips.ownerId, userId)));
}
