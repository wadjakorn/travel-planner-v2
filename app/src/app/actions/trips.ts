'use server';

// Trip CRUD server actions — thin wrappers over trip-service. Parse
// FormData, call the service, handle revalidate/redirect. Domain logic
// lives in @/lib/services/trip-service so the REST API shares it.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  actionError,
  toActionResult,
  type ActionResult,
} from '@/lib/action-result';
import { requireUserId } from '@/lib/with-trip-auth';
import { trimOrNull } from '@/lib/form-parsers';
import { createTrip, deleteTrip, updateTrip } from '@/lib/services/trip-service';

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

// Returns its failure instead of throwing: a thrown ServiceError reaches the
// browser as a redacted digest in production, which loses the message the guard
// exists to deliver. See lib/action-result.ts.
export async function updateTripAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) return actionError('Missing trip.');

  const title = trimOrNull(formData.get('title'));
  const startDate = trimOrNull(formData.get('startDate'));
  const endDate = trimOrNull(formData.get('endDate'));

  const result = await toActionResult(
    () =>
      updateTrip(userId, tripId, {
        title: title ?? undefined,
        startDate: startDate ?? undefined,
        endDate: endDate ?? undefined,
      }).then(() => undefined),
    'Trip details saved',
  );
  if (!result.ok) return result;

  revalidatePath('/');
  revalidatePath(`/trip/${tripId}`);
  revalidatePath(`/trip/${tripId}/calendar`);
  revalidatePath(`/trip/${tripId}/budget`);
  revalidatePath(`/trip/${tripId}/settings`);

  return result;
}
