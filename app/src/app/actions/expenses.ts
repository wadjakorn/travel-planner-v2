'use server';

// Expense CRUD server actions. Phase 5B ships add + edit + delete.
// Split bills + export defer to slice 5C.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { requireUserId } from '@/lib/with-trip-auth';
import { db } from '@/db';
import { expenses } from '@/db/schema';
import { getTripRole } from '@/lib/trip-access';
import {
  createExpense,
  updateExpense,
  removeExpense,
} from '@/lib/services/expense-service';
import { trimOrNull, parseNumber, parseInt32 } from '@/lib/form-parsers';

const CATEGORIES = [
  'transport',
  'hotels',
  'food',
  'activities',
  'shopping',
  'other',
] as const;
type Category = (typeof CATEGORIES)[number];

function parseCategory(v: FormDataEntryValue | null): Category {
  if (typeof v !== 'string' || !CATEGORIES.includes(v as Category)) {
    throw new Error('Invalid category');
  }
  return v as Category;
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
  const userId = await requireUserId();

  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');

  // paidBy defaults to the acting user for web-created expenses.
  await createExpense(userId, tripId, { ...readFields(formData), paidBy: userId });

  revalidatePath(`/trip/${tripId}/budget`);
  redirect(`/trip/${tripId}/budget`);
}

export async function updateExpenseAction(formData: FormData) {
  const userId = await requireUserId();

  const expenseId = trimOrNull(formData.get('expenseId'));
  if (!expenseId) throw new Error('expenseId required');

  const row = await updateExpense(userId, expenseId, readFields(formData));

  revalidatePath(`/trip/${row.tripId}/budget`);
  redirect(`/trip/${row.tripId}/budget`);
}

export async function removeExpenseAction(formData: FormData) {
  const userId = await requireUserId();

  const expenseId = trimOrNull(formData.get('expenseId'));
  if (!expenseId) throw new Error('expenseId required');

  const { tripId } = await removeExpense(userId, expenseId);

  revalidatePath(`/trip/${tripId}/budget`);
}

function csvEscape(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// Returns CSV string for a trip's expenses. Caller-side download is wired
// from the budget page using a Link to /trip/[id]/budget/export.
export async function exportExpensesCsv(tripId: string): Promise<string> {
  const userId = await requireUserId();
  if (!(await getTripRole(tripId, userId))) throw new Error('Forbidden');

  const rows = await db
    .select()
    .from(expenses)
    .where(eq(expenses.tripId, tripId))
    .orderBy(expenses.at);

  const header = ['date', 'category', 'label', 'amount', 'currency', 'dayIdx', 'note'];
  const lines = [header.join(',')];
  for (const r of rows) {
    if (r.deletedAt) continue;
    const date = r.at.toISOString().slice(0, 10);
    lines.push(
      [
        date,
        r.category,
        csvEscape(r.label),
        r.amount,
        r.currency,
        r.dayIdx ?? '',
        csvEscape(r.note),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}
