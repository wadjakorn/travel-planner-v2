import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { TransportForm } from '@/components/transport-form';
import { addTransportAction } from '@/app/actions/bookings';

export const metadata: Metadata = { title: 'Add transport' };

type Params = Promise<{ id: string }>;

export default async function NewTransportPage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const { id: tripId } = await params;
  const tripRow = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!tripRow[0] || tripRow[0].ownerId !== session.user.id) notFound();

  return (
    <TransportForm
      mode="add"
      action={addTransportAction}
      hidden={{ tripId }}
      initial={{ type: 'flight' }}
      cancelHref={`/trip/${tripId}/transport`}
    />
  );
}
