// /trip/new — render the create form, attach the createTripAction.

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { TripCreateForm } from '@/components/trip-create-form';
import { createTripAction } from '@/app/actions/trips';

export const metadata: Metadata = { title: 'New trip' };

export default async function NewTripPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  return <TripCreateForm action={createTripAction} cancelHref="/" />;
}
