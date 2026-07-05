'use server';

// Trip CRUD server actions — thin wrappers over trip-service. Parse
// FormData, call the service, handle revalidate/redirect. Domain logic
// lives in @/lib/services/trip-service so the REST API shares it.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/with-trip-auth';
import { trimOrNull } from '@/lib/form-parsers';
import { createTrip, deleteTrip } from '@/lib/services/trip-service';

export async function createTripAction(formData: FormData) {
  const userId = await requireUserId();

  const { id } = await createTrip(userId, {
    title: trimOrNull(formData.get('title')),
    subtitle: trimOrNull(formData.get('subtitle')),
    startDate: trimOrNull(formData.get('startDate')),
    endDate: trimOrNull(formData.get('endDate')),
    cover: trimOrNull(formData.get('cover')),
  });

  redirect(`/trip/${id}`);
}

export async function deleteTripAction(formData: FormData) {
  const userId = await requireUserId();

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');

  await deleteTrip(userId, tripId);

  revalidatePath('/');
}
