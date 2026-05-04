'use server';

// Trip CRUD server actions. Slice 2B ships create + soft-delete.
// Day / place CRUD lands in slices 2C/2D.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { seedTripDays } from '@/lib/seed-days';

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export async function createTripAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const title = trimOrNull(formData.get('title'));
  if (!title) throw new Error('Title is required');

  const subtitle = trimOrNull(formData.get('subtitle'));
  const startDate = trimOrNull(formData.get('startDate'));
  const endDate = trimOrNull(formData.get('endDate'));

  const [row] = await db
    .insert(trips)
    .values({
      ownerId: session.user.id,
      title,
      subtitle,
      startDate,
      endDate,
    })
    .returning({ id: trips.id });

  if (startDate && endDate) {
    await seedTripDays(row.id, startDate, endDate);
  }

  redirect(`/trip/${row.id}`);
}

export async function deleteTripAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');

  await db
    .update(trips)
    .set({ deletedAt: new Date() })
    .where(and(eq(trips.id, tripId), eq(trips.ownerId, session.user.id)));

  revalidatePath('/');
}
