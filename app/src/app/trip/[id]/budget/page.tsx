// /trip/[id]/budget — spending dashboard + budget settings.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { db } from '@/db';
import { days } from '@/db/schema';
import { BudgetView } from '@/components/budget-view';
import { ExpenseModalHost } from '@/components/expense-modal-host';
import { loadBudgetForTrip, countRowsInCurrency, loadEditableExpenses, RECENT_LIMIT } from '@/lib/expense-queries';
import { saveTripBudgetAction } from '@/app/actions/budget';
import { addExpenseInlineAction, updateExpenseInlineAction, removeExpenseAction } from '@/app/actions/expenses';
import { loadTripBasic } from '@/lib/trip-queries';
import { countEditors, resolveBudgetTarget, resolveTravelers } from '@/lib/trip-travelers';
import { getLang, tFor, tServer, type Lang } from '@/lib/i18n';
import { dayDisplay } from '@/lib/date-format';

type T = ReturnType<typeof tFor>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer();
  return { title: t('budget') };
}

type Params = Promise<{ id: string }>;

// "Day 3 · Saturday, April 12" — days.date is display text, days.idx is the
// 0-based value the form submits. Same convention as the standalone
// expense/new and expense/[id]/edit pages.
function dayLabel(d: { idx: number; label: string; date: string; dateIso: string | null }, t: T, lang: Lang): string {
  return t('expense_day_option', { n: d.idx + 1, date: dayDisplay(d, d.dateIso, lang).date });
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
  const [t, lang] = await Promise.all([tServer(), getLang()]);

  // Loaded first (not in the Promise.all below) because loadEditableExpenses
  // needs the resolved trip currency to match loadBudgetForTrip's inclusion
  // rule — the editable window must cover every row `budget.recent` can show.
  const budget = await loadBudgetForTrip(tripId, trip.currency);

  const cfg = trip.budgetConfig ?? null;
  const [dayRows, editorCount, editable] = await Promise.all([
    db
      .select({ idx: days.idx, label: days.label, date: days.date, dateIso: days.dateIso })
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.idx)),
    // Always counted (not skipped when travelers is explicit): the settings
    // form shows the member fallback as its placeholder.
    countEditors(trip),
    // Scoped to the same window `budget.recent` shows — a row the user
    // cannot see is a row they cannot open in the overlay.
    loadEditableExpenses(tripId, RECENT_LIMIT, budget.currency),
  ]);

  const travelersCount = resolveTravelers(cfg?.travelers, editorCount);
  const travelersDefault = resolveTravelers(null, editorCount);
  const realDaysCount = dayRows.length;
  // Only for the per-day *average* — dividing by zero days would print ∞.
  const daysCount = realDaysCount || 1;

  const foodRow = budget.byCategory.find((r) => r.category === 'food');
  const foodTotal = foodRow?.amount ?? 0;
  const foodCount = foodRow?.count ?? 0;

  // Rows carrying the trip's current currency — the count the currency-change
  // warning quotes. Counted against the *resolved* currency (which may have
  // been inferred), so the warning matches what the page shows.
  const affectedRows = await countRowsInCurrency(tripId, budget.currency);
  const resolvedBudget = resolveBudgetTarget(cfg, travelersCount, realDaysCount);

  return (
    <>
      <div className="flex-1">
        <ExpenseModalHost
          tripId={tripId}
          tripCurrency={budget.currency}
          days={dayRows.map((d) => ({ idx: d.idx, label: dayLabel(d, t, lang) }))}
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
            fromBookings={budget.fromBookings}
            fromExpenses={budget.fromExpenses}
            suggestions={budget.suggestions}
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
            travelersDefault={travelersDefault}
            canEdit={canEdit}
            isOwner={trip.ownerId === user.id}
            affectedRows={affectedRows}
            saveBudgetAction={saveTripBudgetAction}
            mergeAction={removeExpenseAction}
          />
        </ExpenseModalHost>
      </div>
    </>
  );
}
