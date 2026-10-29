// Shared trip layout. Renders Header + TripRail + the persistent map around
// each page, so all trip chrome survives sub-page navigation and the loading
// skeleton only has to stand in for the page column.
//
// loadTripBasic + getTripRole are React-cache wrapped, so child pages
// re-fetching the trip pay zero cost beyond the layout's fetches.

import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { signInPath } from '@/lib/safe-redirect';
import { db } from '@/db';
import { tripMemberships, users } from '@/db/schema';
import { canWrite, getTripRole } from '@/lib/trip-access';
import {
  loadTripBasic,
  loadTrip,
  loadHotelsForTrip,
  loadBookingCounts,
} from '@/lib/trip-queries';
import { buildMapDays } from '@/lib/day-augment';
import { resolveUnits } from '@/lib/user-settings';
import { getLang } from '@/lib/i18n';
import { Header } from '@/components/header';
import { PersistentMap } from '@/components/persistent-map';
import { TripRail } from '@/components/trip-rail';
import { MapPreviewProvider } from '@/components/map-preview-context';
import { PlaceBiasProvider } from '@/components/place-bias-context';
import { DayStopsProvider } from '@/components/day-stops-context';
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
  const { id: tripId } = await params;
  // A shared trip link opened signed-out comes back to the trip, not `/`.
  if (!user?.id) redirect(signInPath(`/trip/${encodeURIComponent(tripId)}`));

  const trip = await loadTripBasic(tripId);
  if (!trip) notFound();
  const role = await getTripRole(tripId, user.id);
  if (!role) notFound();

  const [memberRows, tripFull, hotels, units, counts, lang] =
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
      getLang(),
    ]);

  const mapDays = tripFull ? buildMapDays(tripFull, hotels, units, lang) : [];
  const biasCenters = tripFull ? buildBiasCenters(tripFull, hotels) : { trip: null, byDay: {} };
  // Same Pin[] references as mapDays: the RSC payload reuses them.
  const stopsByDay = Object.fromEntries(mapDays.map((d) => [d.id, d.pins]));

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
          <DayStopsProvider stopsByDay={stopsByDay} units={units}>
            <PlaceBiasProvider centers={biasCenters}>{children}</PlaceBiasProvider>
          </DayStopsProvider>
          <PersistentMap tripId={tripId} mapDays={mapDays} units={units} canEdit={canWrite(role)} />
        </MapPreviewProvider>
      </div>
    </>
  );
}
