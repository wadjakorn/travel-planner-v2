import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { HotelForm } from '@/components/hotel-form';
import { addHotelAction } from '@/app/actions/bookings';

export const metadata: Metadata = { title: 'Add hotel' };

type Params = Promise<{ id: string }>;

export default async function NewHotelPage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const { id: tripId } = await params;
  const tripRow = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!tripRow[0]) notFound();
  if (!canWrite(await getTripRole(tripId, session.user.id))) notFound();

  return (
    <HotelForm
      mode="add"
      action={addHotelAction}
      hidden={{ tripId }}
      cancelHref={`/trip/${tripId}/hotels`}
      tripStart={tripRow[0].startDate}
      tripEnd={tripRow[0].endDate}
    />
  );
}
