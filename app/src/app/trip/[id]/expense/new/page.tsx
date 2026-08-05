import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { loadTripCurrency } from '@/lib/expense-queries';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { db } from '@/db';
import { days, trips } from '@/db/schema';
import { ExpenseForm } from '@/components/expense-form';
import { addExpenseAction } from '@/app/actions/expenses';

export const metadata: Metadata = { title: 'Add expense' };

type Params = Promise<{ id: string }>;

// "Day 3 · Saturday, April 12" — days.date is display text, days.idx is the
// 0-based value the form submits.
function dayLabel(d: { idx: number; date: string }): string {
  return `Day ${d.idx + 1} · ${d.date}`;
}

export default async function NewExpensePage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const { id: tripId } = await params;
  const tripRow = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!tripRow[0]) notFound();
  if (!canWrite(await getTripRole(tripId, session.user.id))) notFound();

  const dayRows = await db
    .select({ idx: days.idx, date: days.date })
    .from(days)
    .where(eq(days.tripId, tripId))
    .orderBy(asc(days.idx));

  const tripCurrency = await loadTripCurrency(tripId, tripRow[0].currency);

  return (
    <ExpenseForm
      mode="add"
      action={addExpenseAction}
      hidden={{ tripId }}
      initial={{ category: 'food' }}
      cancelHref={`/trip/${tripId}/budget`}
      tripCurrency={tripCurrency}
      days={dayRows.map((d) => ({ idx: d.idx, label: dayLabel(d) }))}
      bookingsHref={`/trip/${tripId}/bookings`}
    />
  );
}
