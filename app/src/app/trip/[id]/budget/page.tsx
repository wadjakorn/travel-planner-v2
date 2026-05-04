// /trip/[id]/budget — read-only budget dashboard (Phase 5A).

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { db } from '@/db';
import { trips, days } from '@/db/schema';
import { Header } from '@/components/header';
import { TripNav } from '@/components/trip-nav';
import { BudgetView } from '@/components/budget-view';
import { loadBudgetForTrip } from '@/lib/expense-queries';

export const metadata: Metadata = { title: 'Budget' };

type Params = Promise<{ id: string }>;

export default async function BudgetPage({ params }: { params: Params }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;

  const tripRow = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const trip = tripRow[0];
  if (!trip) notFound();
  const role = await getTripRole(trip.id, user.id);
  if (!role) notFound();
  const canEdit = canWrite(role);

  const [budget, dayRows] = await Promise.all([
    loadBudgetForTrip(tripId),
    db
      .select({ id: days.id })
      .from(days)
      .where(eq(days.tripId, tripId)),
  ]);

  const daysCount = dayRows.length || 1;
  const travelersCount = (trip.collaborators?.length ?? 0) + 1;
  const foodTotal =
    budget.byCategory.find((r) => r.category === 'food')?.amount ?? 0;
  const foodCount =
    budget.byCategory.find((r) => r.category === 'food')?.count ?? 0;

  return (
    <>
      <Header
        user={user}
        tripTitle={trip.title}
        tripUpdatedAt={trip.updatedAt.toISOString()}
      />
      <TripNav tripId={tripId} active="budget" />
      <BudgetView
        tripId={tripId}
        budget={null}
        totalSpent={budget.totalSpent}
        perDay={budget.totalSpent / daysCount}
        perPerson={budget.totalSpent / travelersCount}
        avgMeal={foodCount > 0 ? foodTotal / foodCount : 0}
        currency="USD"
        byCategory={budget.byCategory}
        recent={budget.recent}
        daysCount={daysCount}
        travelersCount={travelersCount}
        addExpenseHref={`/trip/${tripId}/expense/new`}
        canEdit={canEdit}
      />
    </>
  );
}
