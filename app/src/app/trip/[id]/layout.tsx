// Shared trip layout. Renders Header + TripRail + the persistent map around
// each page, so all trip chrome survives sub-page navigation and the loading
// skeleton only has to stand in for the page column.
//
// loadTripBasic + getTripRole are React-cache wrapped, so child pages
// re-fetching the trip pay zero cost beyond the layout's fetches.

import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { tripMemberships, users } from '@/db/schema';
import { getTripRole } from '@/lib/trip-access';
import {
  loadTripBasic,
  loadTrip,
  loadHotelsForTrip,
  loadBookingCounts,
} from '@/lib/trip-queries';
import { buildMapDays } from '@/lib/day-augment';
import { resolveUnits } from '@/lib/user-settings';
import { Header } from '@/components/header';
import { PersistentMap } from '@/components/persistent-map';
import { TripRail } from '@/components/trip-rail';
import { MapPreviewProvider } from '@/components/map-preview-context';
import { PlaceBiasProvider } from '@/components/place-bias-context';
import { buildBiasCenters } from '@/lib/places/bias-center';

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

  const [memberRows, tripFull, hotels, units, counts] =
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
      // loadTrip is cache()-wrapped → the itinerary page's own call dedupes.
      // Building map data here (not in the page) is what lets the <Map> live
      // in the layout and persist across day + sub-page navigation.
      loadTrip(tripId),
      loadHotelsForTrip(tripId),
      resolveUnits(user.id),
      loadBookingCounts(tripId),
    ]);

  const mapDays = tripFull ? buildMapDays(tripFull, hotels, units) : [];
  const biasCenters = tripFull ? buildBiasCenters(tripFull, hotels) : { trip: null, byDay: {} };

  return (
    <>
      <Header
        user={user}
        tripTitle={trip.title}
        tripUpdatedAt={trip.updatedAt.toISOString()}
        collaborators={memberRows}
      />
      <div className="flex pb-14 md:pb-0">
        <TripRail tripId={tripId} counts={counts} />
        <MapPreviewProvider>
          <PlaceBiasProvider centers={biasCenters}>{children}</PlaceBiasProvider>
          <PersistentMap tripId={tripId} mapDays={mapDays} units={units} />
        </MapPreviewProvider>
      </div>
    </>
  );
}
