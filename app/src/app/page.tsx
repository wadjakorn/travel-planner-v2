// Home = trip list. Empty state offers seed-demo + new-trip; filled
// state shows a card grid linking each card to /trip/[id].

import Link from 'next/link';
import { auth } from '@/lib/auth';
import { consumeAnonBudget } from '@/lib/anon-rate-limit';
import { PublicLanding } from '@/components/public-landing';
import { Header } from '@/components/header';
import { TripsBrowser } from '@/components/trips-browser';
import { TripGridEmpty } from '@/components/trip-grid-empty';
import { Plus } from '@/components/icons';
import { Button } from '@/components/ui';
import { loadTripsForOwner } from '@/lib/trip-queries';
import { tServer } from '@/lib/i18n';
import { seedDemoTripAction } from '@/app/actions/seed';
import { deleteTripAction } from '@/app/actions/trips';

export default async function Home() {
  const session = await auth();
  const user = session?.user;
  // Signed-out visitors used to be redirected to /sign-in, which made the
  // production URL unshareable. They now get the public landing page — the
  // `anon` bucket is the backstop for that newly public surface, and a
  // signed-in user never reaches it (TP-0031, plan §3.3/§3.4).
  if (!user?.id) {
    // A page cannot set an HTTP status in the App Router, so a throttled
    // visitor gets a plain message rather than a 429. The endpoints that can
    // answer with a real 429 + Retry-After do (see the /api/auth wrapper).
    const budget = await consumeAnonBudget('anon');
    if (!budget.ok) {
      return (
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-xl font-semibold">Too many requests</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Try again in about {Math.ceil(budget.retryAfter / 60)} minute(s).
          </p>
        </main>
      );
    }
    return <PublicLanding />;
  }

  const [trips, t] = await Promise.all([
    loadTripsForOwner(user.id),
    tServer(),
  ]);

  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-title tracking-tight">{t('trips')}</h1>
          {trips.length > 0 ? (
            <Button asChild className="rounded-full">
              <Link href="/trip/new">
                <Plus width={16} height={16} />
                {t('new_trip')}
              </Link>
            </Button>
          ) : null}
        </div>

        {trips.length === 0 ? (
          <div className="mt-10">
            <TripGridEmpty onSeed={seedDemoTripAction} />
          </div>
        ) : (
          <TripsBrowser
            trips={trips.map((trip) => ({
              id: trip.id,
              title: trip.title,
              subtitle: trip.subtitle,
              startDate: trip.startDate,
              endDate: trip.endDate,
              cover: trip.cover,
              daysCount: trip.daysCount,
              placesCount: trip.placesCount,
              collaborators: trip.collaborators,
            }))}
            onDelete={deleteTripAction}
          />
        )}
      </main>
    </>
  );
}
