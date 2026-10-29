import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { tServer } from '@/lib/i18n';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { loadTripCurrency } from '@/lib/expense-queries';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { TransportForm } from '@/components/transport-form';
import { addTransportAction } from '@/app/actions/bookings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer();
  return { title: t('ride_add_title') };
}

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
  if (!tripRow[0]) notFound();
  if (!canWrite(await getTripRole(tripId, session.user.id))) notFound();

  const tripCurrency = await loadTripCurrency(tripId, tripRow[0].currency);

  return (
    <TransportForm
      mode="add"
      action={addTransportAction}
      hidden={{ tripId }}
      initial={{ type: 'flight' }}
      cancelHref={`/trip/${tripId}/bookings`}
      tripStart={tripRow[0].startDate}
      tripEnd={tripRow[0].endDate}
      tripCurrency={tripCurrency}
    />
  );
}
