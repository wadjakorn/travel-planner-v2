'use server';

// Trip CRUD server actions. Slice 2B ships create + soft-delete.
// Day / place CRUD lands in slices 2C/2D.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/with-trip-auth';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { seedTripDays } from '@/lib/seed-days';
import { trimOrNull } from '@/lib/form-parsers';

export async function createTripAction(formData: FormData) {
  const userId = await requireUserId();

  const title = trimOrNull(formData.get('title'));
  if (!title) throw new Error('Title is required');

  const subtitle = trimOrNull(formData.get('subtitle'));
  const startDate = trimOrNull(formData.get('startDate'));
  const endDate = trimOrNull(formData.get('endDate'));
  const cover = trimOrNull(formData.get('cover'));

  const [row] = await db
    .insert(trips)
    .values({
      ownerId: userId,
      title,
      subtitle,
      startDate,
      endDate,
      cover,
    })
    .returning({ id: trips.id });

  if (startDate && endDate) {
    await seedTripDays(row.id, startDate, endDate);
  }

  redirect(`/trip/${row.id}`);
}

export async function deleteTripAction(formData: FormData) {
  const userId = await requireUserId();

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');

  await db
    .update(trips)
    .set({ deletedAt: new Date() })
    .where(and(eq(trips.id, tripId), eq(trips.ownerId, userId)));

  revalidatePath('/');
}
