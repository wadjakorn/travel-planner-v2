// Expense (+ splits) mutation service for the REST API. Trip-scoped,
// soft-deleted. Splits are replaced wholesale on create/update.

import 'server-only';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { expenses, expenseSplits } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { ServiceError } from './service-error';
import { requireTripAccess } from './access';

const CATEGORIES = [
  'transport', 'hotels', 'food', 'activities', 'shopping', 'other',
];

const EXPENSE_FIELDS = [
  'dayIdx', 'category', 'label', 'amount', 'currency', 'paidBy', 'note', 'at',
] as const;

// `at` is a timestamp column (mode: 'date'). The web action passes a Date;
// an API caller may pass an ISO string — coerce so both land as a Date.
function coerceAt(fields: Record<string, unknown>): void {
  if (typeof fields.at === 'string') {
    const d = new Date(fields.at);
    if (Number.isNaN(d.getTime())) {
      throw new ServiceError('bad_request', '"at" must be a valid date');
    }
    fields.at = d;
  }
}

type SplitInput = { accountId: string; shareAmount?: number | null; sharePct?: number | null };

function pick(body: Record<string, unknown>, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

function parseSplits(v: unknown): SplitInput[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    throw new ServiceError('bad_request', '"splits" must be an array');
  }
  return v.map((s) => {
    if (!s || typeof s !== 'object' || typeof (s as Record<string, unknown>).accountId !== 'string') {
      throw new ServiceError('bad_request', 'each split needs an "accountId"');
    }
    const o = s as Record<string, unknown>;
    return {
      accountId: o.accountId as string,
      shareAmount: typeof o.shareAmount === 'number' ? o.shareAmount : null,
      sharePct: typeof o.sharePct === 'number' ? o.sharePct : null,
    };
  });
}

async function replaceSplits(
  expenseId: string,
  splits: SplitInput[],
  exec: IdemExecutor = db,
): Promise<void> {
  await exec.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
  if (splits.length > 0) {
    await exec.insert(expenseSplits).values(
      splits.map((s) => ({
        expenseId,
        accountId: s.accountId,
        shareAmount: s.shareAmount ?? null,
        sharePct: s.sharePct ?? null,
      })),
    );
  }
}

export async function listExpenses(userId: string, tripId: string) {
  await requireTripAccess(userId, tripId, 'read');
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)))
    .orderBy(asc(expenses.at));
  if (rows.length === 0) return [];
  const splits = await db.select().from(expenseSplits);
  const byExpense = new Map<string, typeof splits>();
  for (const s of splits) {
    const arr = byExpense.get(s.expenseId) ?? [];
    arr.push(s);
    byExpense.set(s.expenseId, arr);
  }
  return rows.map((e) => ({ ...e, splits: byExpense.get(e.id) ?? [] }));
}

export async function createExpense(
  userId: string,
  tripId: string,
  body: Record<string, unknown>,
  exec: IdemExecutor = db,
) {
  await requireTripAccess(userId, tripId, 'write', exec);
  const fields = pick(body, EXPENSE_FIELDS);
  if (typeof fields.category !== 'string' || !CATEGORIES.includes(fields.category)) {
    throw new ServiceError('bad_request', `"category" must be one of: ${CATEGORIES.join(', ')}`);
  }
  if (typeof fields.amount !== 'number' || !Number.isFinite(fields.amount)) {
    throw new ServiceError('bad_request', '"amount" must be a number');
  }
  coerceAt(fields);
  const splits = parseSplits(body.splits);
  const [row] = await (exec as typeof db)
    .insert(expenses)
    .values({
      ...fields,
      tripId,
      category: fields.category as 'transport' | 'hotels' | 'food' | 'activities' | 'shopping' | 'other',
      amount: fields.amount,
    })
    .returning();
  if (splits) await replaceSplits(row.id, splits, exec);
  await touchTrip(tripId, exec);
  await writeAudit({ tripId, userId, action: 'add', entityType: 'expense', entityId: row.id });
  return row;
}

async function resolveExpense(id: string) {
  const [row] = await db
    .select({ tripId: expenses.tripId })
    .from(expenses)
    .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
    .limit(1);
  if (!row) throw new ServiceError('not_found', 'Expense not found');
  return row.tripId;
}

export async function updateExpense(
  userId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const tripId = await resolveExpense(id);
  await requireTripAccess(userId, tripId, 'write');
  const fields = pick(body, EXPENSE_FIELDS);
  if (
    fields.category !== undefined &&
    (typeof fields.category !== 'string' || !CATEGORIES.includes(fields.category))
  ) {
    throw new ServiceError('bad_request', 'invalid "category"');
  }
  if (
    fields.amount !== undefined &&
    (typeof fields.amount !== 'number' || !Number.isFinite(fields.amount))
  ) {
    throw new ServiceError('bad_request', '"amount" must be a number');
  }
  coerceAt(fields);
  const splits = parseSplits(body.splits);
  const [row] = await db
    .update(expenses)
    .set(fields)
    .where(eq(expenses.id, id))
    .returning();
  if (splits) await replaceSplits(id, splits);
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'update', entityType: 'expense', entityId: id });
  return row;
}

export async function removeExpense(userId: string, id: string) {
  const tripId = await resolveExpense(id);
  await requireTripAccess(userId, tripId, 'write');
  await db
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(eq(expenses.id, id));
  await touchTrip(tripId);
  await writeAudit({ tripId, userId, action: 'remove', entityType: 'expense', entityId: id });
  return { tripId };
}
