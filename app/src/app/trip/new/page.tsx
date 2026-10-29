// /trip/new — render the create form, attach the createTripAction.

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { TripCreateForm } from '@/components/trip-create-form';
import { createTripAction } from '@/app/actions/trips';
import { tServer } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer();
  return { title: t('new_trip') };
}

export default async function NewTripPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  return <TripCreateForm action={createTripAction} cancelHref="/" />;
}
