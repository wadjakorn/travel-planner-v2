// /trip/[id]/budget — spending dashboard + budget settings.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { and, count, eq, ne } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { db } from '@/db';
import { days, tripMemberships } from '@/db/schema';
import { TripRail } from '@/components/trip-rail';
import { BudgetView } from '@/components/budget-view';
import { loadBudgetForTrip } from '@/lib/expense-queries';
import { loadTripBasic, loadBookingCounts } from '@/lib/trip-queries';

export const metadata: Metadata = { title: 'Budget' };

type Params = Promise<{ id: string }>;

export default async function BudgetPage({ params }: { params: Params }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;

  const trip = await loadTripBasic(tripId);
  if (!trip) notFound();
  const role = await getTripRole(trip.id, user.id);
  if (!role) notFound();
  const canEdit = canWrite(role);

  const [budget, dayRows, counts, memberRows] = await Promise.all([
    loadBudgetForTrip(tripId, trip.currency),
    db.select({ id: days.id }).from(days).where(eq(days.tripId, tripId)),
    loadBookingCounts(tripId),
    // Real members, not the collaborators jsonb — that column holds
    // {initials, color} for drawing avatars and has nothing to do with who is
    // actually on the trip. Viewers are excluded: someone who can only look at
    // the plan is not a head the per-person budget divides by.
    db
      .select({ c: count() })
      .from(tripMemberships)
      .where(
        and(
          eq(tripMemberships.tripId, tripId),
          // The role enum is editor|viewer only — the owner is the +1 below.
          eq(tripMemberships.role, 'editor'),
          // The owner is counted once, below. Today no path creates a
          // membership row for them (acceptInvite skips the owner outright),
          // but excluding them here means a future path that does cannot
          // silently double the head count the per-person budget divides by.
          ne(tripMemberships.userId, trip.ownerId),
        ),
      ),
  ]);

  // Counted against the *resolved* currency (which may have been inferred), so
  // the "N entries are recorded in X" warning matches what the page shows.

  const realDaysCount = dayRows.length;
  // Only for the per-day *average* — dividing by zero days would print ∞.
  const daysCount = realDaysCount || 1;
  // The owner has no membership row (invites.ts skips them), so +1 is the owner.
  const travelersCount = memberRows[0].c + 1;

  const foodRow = budget.byCategory.find((r) => r.category === 'food');
  const foodTotal = foodRow?.amount ?? 0;
  const foodCount = foodRow?.count ?? 0;

  // "per person" and "per day" are ways of entering a budget, not separate
  // budgets — multiply back out to one comparable number. A per-day budget on
  // a trip with no days yet has no meaningful multiplier, so it resolves to
  // null (no budget bar) rather than to the raw amount, which would read as a
  // one-day budget.
  const cfg = trip.budgetConfig ?? null;
  const target = cfg?.amount ?? null;
  const resolvedBudget =
    cfg == null || target == null
      ? null
      : cfg.basis === 'per_person'
        ? target * travelersCount
        : cfg.basis === 'per_day'
          ? realDaysCount > 0
            ? target * realDaysCount
            : null
          : target;

  return (
    <>
      <TripRail tripId={tripId} active="budget" counts={counts} />
      <div className="flex-1">
        <BudgetView
          tripId={tripId}
          budget={resolvedBudget}
          budgetConfig={cfg}
          totalSpent={budget.totalSpent}
          perDay={budget.totalSpent / daysCount}
          perPerson={budget.totalSpent / travelersCount}
          avgMeal={foodCount > 0 ? foodTotal / foodCount : 0}
          currency={budget.currency}
          byCategory={budget.byCategory}
          recent={budget.recent}
          excluded={budget.excluded}
          missingCost={budget.missingCost}
          daysCount={daysCount}
          travelersCount={travelersCount}
          addExpenseHref={`/trip/${tripId}/expense/new`}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
