// Home = trip list. Empty state offers seed-demo + new-trip; filled
// state shows a card grid linking each card to /trip/[id].

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Header } from '@/components/header';
import { TripCard } from '@/components/trip-card';
import { TripGridEmpty } from '@/components/trip-grid-empty';
import { Plus } from '@/components/icons';
import { loadTripsForOwner } from '@/lib/trip-queries';
import { seedDemoTripAction } from '@/app/actions/seed';
import { deleteTripAction } from '@/app/actions/trips';

export default async function Home() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const trips = await loadTripsForOwner(user.id);

  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
          {trips.length > 0 ? (
            <Link
              href="/trip/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              <Plus width={16} height={16} />
              New trip
            </Link>
          ) : null}
        </div>

        {trips.length === 0 ? (
          <div className="mt-10">
            <TripGridEmpty onSeed={seedDemoTripAction} />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={{
                  id: trip.id,
                  title: trip.title,
                  subtitle: trip.subtitle,
                  startDate: trip.startDate,
                  endDate: trip.endDate,
                  cover: trip.cover,
                  daysCount: trip.daysCount,
                  placesCount: trip.placesCount,
                  collaborators: trip.collaborators,
                }}
                onDelete={deleteTripAction}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
