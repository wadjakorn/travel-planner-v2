import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { canWrite, getTripRole } from '@/lib/trip-access';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { ExpenseForm } from '@/components/expense-form';
import { addExpenseAction } from '@/app/actions/expenses';

export const metadata: Metadata = { title: 'Add expense' };

type Params = Promise<{ id: string }>;

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

  return (
    <ExpenseForm
      mode="add"
      action={addExpenseAction}
      hidden={{ tripId }}
      initial={{ category: 'food' }}
      cancelHref={`/trip/${tripId}/budget`}
    />
  );
}
