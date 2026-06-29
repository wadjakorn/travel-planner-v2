// Shared trip layout. Renders Header + opens a flex shell. Each child
// page is responsible for rendering its own <TripRail active="..."/>
// since layouts can't know the active segment server-side.
//
// loadTripBasic + getTripRole are React-cache wrapped, so child pages
// re-fetching the trip pay zero cost beyond the layout's fetches.

import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { tripMemberships, users } from '@/db/schema';
import { getTripRole } from '@/lib/trip-access';
import { loadTripBasic } from '@/lib/trip-queries';
import { loadUserSettings } from '@/lib/user-settings';
import { getDict } from '@/lib/i18n';
import { Header } from '@/components/header';

type Params = Promise<{ id: string }>;

export default async function TripLayout({
  params,
  children,
}: {
  params: Params;
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;

  const trip = await loadTripBasic(tripId);
  if (!trip) notFound();
  const role = await getTripRole(tripId, user.id);
  if (!role) notFound();

  const [memberRows, settings, dict] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(tripMemberships)
      .innerJoin(users, eq(users.id, tripMemberships.userId))
      .where(eq(tripMemberships.tripId, tripId)),
    loadUserSettings(user.id),
    getDict(),
  ]);

  return (
    <>
      <Header
        user={user}
        tripTitle={trip.title}
        tripUpdatedAt={trip.updatedAt.toISOString()}
        settings={settings}
        dict={dict}
        collaborators={memberRows}
      />
      <div className="flex pb-24 md:pb-0">{children}</div>
    </>
  );
}
