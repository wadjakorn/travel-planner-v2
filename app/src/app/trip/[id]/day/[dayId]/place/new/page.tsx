// /trip/[id]/day/[dayId]/place/new — render the add-place form.

import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { db } from '@/db';
import { days, trips } from '@/db/schema';
import { PlaceForm } from '@/components/place-form';
import { addPlaceAction } from '@/app/actions/places';

export const metadata: Metadata = { title: 'Add place' };

type Params = Promise<{ id: string; dayId: string }>;

export default async function NewPlacePage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const { id: tripId, dayId } = await params;

  const row = await db
    .select({ tripId: days.tripId, ownerId: trips.ownerId })
    .from(days)
    .innerJoin(trips, eq(trips.id, days.tripId))
    .where(eq(days.id, dayId))
    .limit(1);

  if (!row[0] || row[0].tripId !== tripId) notFound();
  if (!canWrite(await getTripRole(tripId, session.user.id))) notFound();

  return (
    <PlaceForm
      mode="add"
      action={addPlaceAction}
      hidden={{ dayId }}
      cancelHref={`/trip/${tripId}`}
    />
  );
}
