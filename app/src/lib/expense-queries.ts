// Budget aggregation queries. Phase 5A ships read paths; Phase 5B
// wires expense CRUD that mutates these tables.

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { expenses } from '@/db/schema';
import type { Expense } from '@/db/schema';

export type CategoryTotal = {
  category: 'transport' | 'hotels' | 'food' | 'activities' | 'shopping' | 'other';
  amount: number;
  count: number;
};

export type BudgetSummary = {
  totalSpent: number;
  byCategory: CategoryTotal[];
  recent: Expense[];
};

const CATEGORIES = [
  'transport',
  'hotels',
  'food',
  'activities',
  'shopping',
  'other',
] as const;

export async function loadBudgetForTrip(
  tripId: string,
): Promise<BudgetSummary> {
  const [totalsRow, recentRows] = await Promise.all([
    db
      .select({
        category: expenses.category,
        amount: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(expenses)
      .where(
        and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)),
      )
      .groupBy(expenses.category),
    db
      .select()
      .from(expenses)
      .where(
        and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)),
      )
      .orderBy(desc(expenses.at))
      .limit(10),
  ]);

  const byCategoryMap = new Map(
    totalsRow.map((r) => [r.category, { amount: Number(r.amount), count: Number(r.count) }]),
  );
  const byCategory: CategoryTotal[] = CATEGORIES.map((category) => {
    const m = byCategoryMap.get(category);
    return {
      category,
      amount: m?.amount ?? 0,
      count: m?.count ?? 0,
    };
  });

  const totalSpent = byCategory.reduce((sum, r) => sum + r.amount, 0);

  return { totalSpent, byCategory, recent: recentRows };
}
