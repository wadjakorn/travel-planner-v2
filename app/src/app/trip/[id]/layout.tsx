// Shared trip layout. Renders Header + opens a flex shell. Each child
// page is responsible for rendering its own <TripRail active="..."/>
// since layouts can't know the active segment server-side.
//
// loadTripBasic + getTripRole are React-cache wrapped, so child pages
// re-fetching the trip pay zero cost beyond the layout's fetches.

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { tripMemberships, users } from '@/db/schema';
import { getTripRole } from '@/lib/trip-access';
import {
  loadTripBasic,
  loadTrip,
  loadHotelsForTrip,
} from '@/lib/trip-queries';
import { loadUserSettings } from '@/lib/user-settings';
import { getDict } from '@/lib/i18n';
import { buildMapDays } from '@/lib/day-augment';
import type { Units } from '@/lib/units';
import { Header } from '@/components/header';
import { PersistentMap } from '@/components/persistent-map';

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

  const [memberRows, settings, dict, tripFull, hotels, cookieStore] =
    await Promise.all([
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
      // loadTrip is cache()-wrapped → the itinerary page's own call dedupes.
      // Building map data here (not in the page) is what lets the <Map> live
      // in the layout and persist across day + sub-page navigation.
      loadTrip(tripId),
      loadHotelsForTrip(tripId),
      cookies(),
    ]);

  const units = (
    cookieStore.get('units')?.value === 'imperial' ? 'imperial' : 'metric'
  ) as Units;
  const mapDays = tripFull ? buildMapDays(tripFull, hotels, units) : [];

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
      <div className="flex pb-24 md:pb-0">
        {children}
        <PersistentMap tripId={tripId} mapDays={mapDays} />
      </div>
    </>
  );
}
