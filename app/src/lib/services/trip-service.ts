// Trip mutation service. Framework-agnostic: takes an acting-user id +
// typed input, no FormData / redirect / revalidate. Called by the trip
// server actions today and the REST API (ticket API-B) tomorrow.

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { seedTripDays } from '@/lib/seed-days';
import { touchTrip } from '@/lib/touch-trip';
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
): Promise<{ id: string }> {
  const title = input.title;
  if (!title) throw new ServiceError('bad_request', 'Title is required');

  const [row] = await db
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
    await seedTripDays(row.id, input.startDate, input.endDate);
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

// Patch a trip's header fields. Only keys present in `input` are written.
// Requires write access (owner or editor).
export async function updateTrip(
  userId: string,
  tripId: string,
  input: UpdateTripInput,
): Promise<{ tripId: string }> {
  await assertTripWrite(userId, tripId);

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
    patch.updatedAt = new Date();
    await db.update(trips).set(patch).where(eq(trips.id, tripId));
  }
  await touchTrip(tripId);

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
