// /trip/[id]/budget — spending dashboard + budget settings.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { db } from '@/db';
import { days, tripMemberships } from '@/db/schema';
import { TripRail } from '@/components/trip-rail';
import { BudgetView } from '@/components/budget-view';
import { ExpenseModalHost } from '@/components/expense-modal-host';
import { loadBudgetForTrip, countRowsInCurrency, loadEditableExpenses, RECENT_LIMIT } from '@/lib/expense-queries';
import { saveTripBudgetAction } from '@/app/actions/budget';
import { addExpenseInlineAction, updateExpenseInlineAction, removeExpenseAction } from '@/app/actions/expenses';
import { loadTripBasic, loadBookingCounts } from '@/lib/trip-queries';

export const metadata: Metadata = { title: 'Budget' };

type Params = Promise<{ id: string }>;

// "Day 3 · Saturday, April 12" — days.date is display text, days.idx is the
// 0-based value the form submits. Same convention as the standalone
// expense/new and expense/[id]/edit pages.
function dayLabel(d: { idx: number; date: string }): string {
  return `Day ${d.idx + 1} · ${d.date}`;
}

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

  const [budget, dayRows, counts, memberRows, editable] = await Promise.all([
    loadBudgetForTrip(tripId, trip.currency),
    db
      .select({ idx: days.idx, date: days.date })
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.idx)),
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
    // Scoped to the same window `budget.recent` shows — a row the user
    // cannot see is a row they cannot open in the overlay.
    loadEditableExpenses(tripId, RECENT_LIMIT),
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
  // Rows carrying the trip's current currency — the count the currency-change
  // warning quotes. Uses the resolved currency, not the raw column.
  const affectedRows = await countRowsInCurrency(tripId, budget.currency);
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
        <ExpenseModalHost
          tripId={tripId}
          tripCurrency={budget.currency}
          days={dayRows.map((d) => ({ idx: d.idx, label: dayLabel(d) }))}
          editable={editable}
          addAction={addExpenseInlineAction}
          updateAction={updateExpenseInlineAction}
          deleteAction={removeExpenseAction}
        >
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
            canEdit={canEdit}
            isOwner={trip.ownerId === user.id}
            affectedRows={affectedRows}
            saveBudgetAction={saveTripBudgetAction}
          />
        </ExpenseModalHost>
      </div>
    </>
  );
}
