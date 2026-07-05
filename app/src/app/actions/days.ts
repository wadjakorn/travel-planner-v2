'use server';

// Day CRUD server actions — thin wrappers over day-service. Parse
// FormData, call the service, handle revalidate/redirect.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/with-trip-auth';
import { trimOrNull } from '@/lib/form-parsers';
import { addDay, removeDay } from '@/lib/services/day-service';

export async function addDayAction(formData: FormData) {
  const userId = await requireUserId();

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');

  const { idx } = await addDay(userId, tripId);

  revalidatePath(`/trip/${tripId}`);
  redirect(`/trip/${tripId}?day=${idx}`);
}

export async function removeDayAction(formData: FormData) {
  const userId = await requireUserId();

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');

  const { tripId, targetIdx } = await removeDay(userId, dayId);

  revalidatePath(`/trip/${tripId}`);
  redirect(`/trip/${tripId}?day=${targetIdx}`);
}
