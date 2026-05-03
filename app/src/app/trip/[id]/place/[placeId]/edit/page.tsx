// /trip/[id]/place/[placeId]/edit — render the edit-place form pre-filled.

import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { days, places, trips } from '@/db/schema';
import { PlaceForm } from '@/components/place-form';
import { updatePlaceAction } from '@/app/actions/places';

export const metadata: Metadata = { title: 'Edit place' };

type Params = Promise<{ id: string; placeId: string }>;

export default async function EditPlacePage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const { id: tripId, placeId } = await params;

  const row = await db
    .select({
      place: places,
      ownerId: trips.ownerId,
      dayTripId: days.tripId,
    })
    .from(places)
    .innerJoin(days, eq(days.id, places.dayId))
    .innerJoin(trips, eq(trips.id, days.tripId))
    .where(eq(places.id, placeId))
    .limit(1);

  const r = row[0];
  if (!r || r.ownerId !== session.user.id || r.dayTripId !== tripId) {
    notFound();
  }

  return (
    <PlaceForm
      mode="edit"
      action={updatePlaceAction}
      hidden={{ placeId }}
      initial={{
        kind: r.place.kind,
        name: r.place.name,
        category: r.place.category,
        rating: r.place.rating,
        reviews: r.place.reviews,
        time: r.place.time,
        duration: r.place.duration,
        price: r.place.price,
        address: r.place.address,
        phone: r.place.phone,
        website: r.place.website,
        hours: r.place.hours,
        tags: r.place.tags,
        thumb: r.place.thumb,
        note: r.place.note,
      }}
      cancelHref={`/trip/${tripId}`}
    />
  );
}
