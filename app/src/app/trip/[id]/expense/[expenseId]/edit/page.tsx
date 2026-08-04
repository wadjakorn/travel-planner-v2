import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { loadTripCurrency } from '@/lib/expense-queries';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { db } from '@/db';
import { days, expenses, trips } from '@/db/schema';
import { ExpenseForm } from '@/components/expense-form';
import {
  updateExpenseAction,
  removeExpenseRedirectAction,
} from '@/app/actions/expenses';

export const metadata: Metadata = { title: 'Edit expense' };

type Params = Promise<{ id: string; expenseId: string }>;

// "Day 3 · Saturday, April 12" — days.date is display text, days.idx is the
// 0-based value the form submits.
function dayLabel(d: { idx: number; date: string }): string {
  return `Day ${d.idx + 1} · ${d.date}`;
}

export default async function EditExpensePage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const { id: tripId, expenseId } = await params;

  const row = await db
    .select({ expense: expenses, ownerId: trips.ownerId, tripCurrency: trips.currency })
    .from(expenses)
    .innerJoin(trips, eq(trips.id, expenses.tripId))
    .where(eq(expenses.id, expenseId))
    .limit(1);

  const r = row[0];
  if (!r || r.expense.tripId !== tripId) notFound();
  if (!canWrite(await getTripRole(tripId, session.user.id))) notFound();

  const dayRows = await db
    .select({ idx: days.idx, date: days.date })
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(asc(days.idx));

  const e = r.expense;
  const tripCurrency = await loadTripCurrency(tripId, r.tripCurrency);

  return (
    <ExpenseForm
      mode="edit"
      action={updateExpenseAction}
      deleteAction={removeExpenseRedirectAction}
      hidden={{ expenseId }}
      initial={{
        category: e.category,
        label: e.label,
        amount: e.amount,
        dayIdx: e.dayIdx,
        note: e.note,
        at: e.at.toISOString().slice(0, 10),
      }}
      cancelHref={`/trip/${tripId}/budget`}
      tripCurrency={tripCurrency}
      days={dayRows.map((d) => ({ idx: d.idx, label: dayLabel(d) }))}
      bookingsHref={`/trip/${tripId}/bookings`}
    />
  );
}
