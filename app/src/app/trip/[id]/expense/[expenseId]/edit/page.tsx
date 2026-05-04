import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { db } from '@/db';
import { expenses, trips } from '@/db/schema';
import { ExpenseForm } from '@/components/expense-form';
import { updateExpenseAction } from '@/app/actions/expenses';

export const metadata: Metadata = { title: 'Edit expense' };

type Params = Promise<{ id: string; expenseId: string }>;

export default async function EditExpensePage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const { id: tripId, expenseId } = await params;

  const row = await db
    .select({ expense: expenses, ownerId: trips.ownerId })
    .from(expenses)
    .innerJoin(trips, eq(trips.id, expenses.tripId))
    .where(eq(expenses.id, expenseId))
    .limit(1);

  const r = row[0];
  if (!r || r.expense.tripId !== tripId) notFound();
  if (!canWrite(await getTripRole(tripId, session.user.id))) notFound();

  const e = r.expense;
  return (
    <ExpenseForm
      mode="edit"
      action={updateExpenseAction}
      hidden={{ expenseId }}
      initial={{
        category: e.category,
        label: e.label,
        amount: e.amount,
        currency: e.currency,
        dayIdx: e.dayIdx,
        note: e.note,
        at: e.at.toISOString().slice(0, 10),
      }}
      cancelHref={`/trip/${tripId}/budget`}
    />
  );
}
