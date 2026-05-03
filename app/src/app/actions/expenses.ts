'use server';

// Expense CRUD server actions. Phase 5B ships add + edit + delete.
// Split bills + export defer to slice 5C.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { expenses, trips } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';

const CATEGORIES = [
  'transport',
  'hotels',
  'food',
  'activities',
  'shopping',
  'other',
] as const;
type Category = (typeof CATEGORIES)[number];

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseNumber(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseInt32(v: FormDataEntryValue | null): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n);
}

function parseCategory(v: FormDataEntryValue | null): Category {
  if (typeof v !== 'string' || !CATEGORIES.includes(v as Category)) {
    throw new Error('Invalid category');
  }
  return v as Category;
}

async function ownsTrip(userId: string, tripId: string): Promise<boolean> {
  const row = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.ownerId, userId)))
    .limit(1);
  return row.length > 0;
}

async function ownsExpense(
  userId: string,
  expenseId: string,
): Promise<{ tripId: string } | null> {
  const row = await db
    .select({ tripId: expenses.tripId, ownerId: trips.ownerId })
    .from(expenses)
    .innerJoin(trips, eq(trips.id, expenses.tripId))
    .where(eq(expenses.id, expenseId))
    .limit(1);
  const r = row[0];
  if (!r || r.ownerId !== userId) return null;
  return { tripId: r.tripId };
}

function readFields(formData: FormData) {
  const amount = parseNumber(formData.get('amount'));
  if (amount === null) throw new Error('Amount is required');

  const atStr = trimOrNull(formData.get('at'));
  const at = atStr ? new Date(atStr) : new Date();

  return {
    category: parseCategory(formData.get('category')),
    label: trimOrNull(formData.get('label')),
    amount,
    currency: trimOrNull(formData.get('currency')) ?? 'USD',
    dayIdx: parseInt32(formData.get('dayIdx')),
    note: trimOrNull(formData.get('note')),
    at,
  };
}

export async function addExpenseAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');
  if (!(await ownsTrip(session.user.id, tripId))) throw new Error('Forbidden');

  const fields = readFields(formData);
  await db.insert(expenses).values({
    ...fields,
    tripId,
    paidBy: session.user.id,
  });
  await touchTrip(tripId);

  revalidatePath(`/trip/${tripId}/budget`);
  redirect(`/trip/${tripId}/budget`);
}

export async function updateExpenseAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const expenseId = trimOrNull(formData.get('expenseId'));
  if (!expenseId) throw new Error('expenseId required');

  const owned = await ownsExpense(session.user.id, expenseId);
  if (!owned) throw new Error('Forbidden');

  const fields = readFields(formData);
  await db.update(expenses).set(fields).where(eq(expenses.id, expenseId));
  await touchTrip(owned.tripId);

  revalidatePath(`/trip/${owned.tripId}/budget`);
  redirect(`/trip/${owned.tripId}/budget`);
}

export async function removeExpenseAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const expenseId = trimOrNull(formData.get('expenseId'));
  if (!expenseId) throw new Error('expenseId required');

  const owned = await ownsExpense(session.user.id, expenseId);
  if (!owned) throw new Error('Forbidden');

  await db
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(eq(expenses.id, expenseId));
  await touchTrip(owned.tripId);

  revalidatePath(`/trip/${owned.tripId}/budget`);
}
