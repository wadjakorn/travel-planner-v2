// Budget roll-up for one trip.
//
// Two things make this more than a SUM over the expense table:
//
// 1. Costs already entered on hotel and transport bookings count toward the
//    budget, and are *derived* at read time — no rows are copied into the
//    expense table. Editing a booking moves the total immediately, and there
//    is no sync path that can drift.
// 2. The app never converts currencies. A trip has one currency; rows in any
//    other currency are excluded from the total and reported separately,
//    rather than being added to a number that would mean nothing.
//
// (2) is a behaviour change: the previous version summed every row regardless
// of currency, so a trip mixing THB and USD produced a meaningless figure.
// Totals on such trips will go *down* after this ships. That is the fix.

import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { expenses, hotelBookings, transportBookings } from '@/db/schema';
import type { ExpenseCategory } from '@/db/schema';
import { EXPENSE_CATEGORIES } from '@/db/schema';
import { parseLooseDate } from '@/lib/loose-date';
import { resolveTripCurrency, effectiveCurrency } from '@/lib/trip-currency';
import { toEditableExpense, type EditableExpense } from '@/lib/editable-expense';
import { desc } from 'drizzle-orm';

export type BudgetSource = 'expense' | 'hotel' | 'transport';

// One line in the budget list. Booking-sourced rows are read-only here and
// link back to the bookings page — the total and the list have to reconcile,
// otherwise the hero number has no visible explanation.
export type BudgetRow = {
  id: string;
  source: BudgetSource;
  category: ExpenseCategory;
  label: string;
  amount: number;
  currency: string;
  at: Date;
  href: string;
};

export type CategoryTotal = {
  category: ExpenseCategory;
  amount: number;
  // Rows counted, from every source — booking costs included. A count that
  // only tracked expense rows would under-report the "N items" label on the
  // hotels and transport cards, which are exactly the two fed by bookings.
  count: number;
  // Split out so the view can warn about double counting: a category holding
  // both a booking cost and a hand-entered expense may well be the same money
  // twice. Both are counted — guessing which is the duplicate would be worse.
  fromBooking: number;
  fromExpense: number;
};

export type BudgetSummary = {
  currency: string;
  totalSpent: number;
  byCategory: CategoryTotal[];
  recent: BudgetRow[];
  // Rows in some other currency. Not summed (no conversion), just counted, so
  // the page can say why a number the user expected is missing.
  excluded: { count: number; currencies: string[] };
  // Bookings with no cost filled in. They cannot be counted — there is no
  // number — but they are the reason the total is lower than the trip really
  // costs, so they are surfaced rather than silently skipped.
  missingCost: { hotels: number; transport: number };
};

// Minimal row shapes, so the pure builder can be unit-tested without the DB.
export type ExpenseInput = {
  id: string;
  category: ExpenseCategory;
  label: string | null;
  amount: number;
  currency: string;
  at: Date;
};

export type BookingInput = {
  id: string;
  label: string;
  costAmount: number | null;
  costCurrency: string | null;
  date: string | null; // loose date text from the booking form
  createdAt: Date;
};

// Exported so the page can scope the editable-rows window to the same
// count as the recent list — a row the user cannot see is a row they
// cannot open.
export const RECENT_LIMIT = 10;

function bookingDate(b: BookingInput): Date {
  const iso = parseLooseDate(b.date);
  // `${iso}T00:00:00Z` — bookings carry a date with no time, and parsing it as
  // local time would shift the row a day for anyone west of UTC.
  return iso ? new Date(`${iso}T00:00:00Z`) : b.createdAt;
}

export function buildBudgetSummary(input: {
  tripId: string;
  // null until someone picks one in budget settings, in which case it is
  // inferred from the rows below — see lib/trip-currency.
  tripCurrency: string | null;
  expenses: ExpenseInput[];
  hotels: BookingInput[];
  transport: BookingInput[];
}): BudgetSummary {
  const { tripId } = input;
  const tripCurrency = resolveTripCurrency(input.tripCurrency, [
    ...input.expenses.map((e) => e.currency),
    ...input.hotels.map((h) => h.costCurrency),
    ...input.transport.map((t) => t.costCurrency),
  ]);
  const included: BudgetRow[] = [];
  const excludedCurrencies = new Set<string>();
  let excludedCount = 0;
  const missingCost = { hotels: 0, transport: 0 };

  for (const e of input.expenses) {
    const cur = effectiveCurrency(e.currency, tripCurrency);
    if (cur !== tripCurrency) {
      excludedCount++;
      excludedCurrencies.add(cur);
      continue;
    }
    included.push({
      id: e.id,
      source: 'expense',
      category: e.category,
      label: e.label ?? e.category,
      amount: e.amount,
      currency: cur,
      at: e.at,
      href: `/trip/${tripId}/expense/${e.id}/edit`,
    });
  }

  const bookingGroups: Array<{
    rows: BookingInput[];
    source: BudgetSource;
    category: ExpenseCategory;
  }> = [
    { rows: input.hotels, source: 'hotel', category: 'hotels' },
    { rows: input.transport, source: 'transport', category: 'transport' },
  ];

  for (const g of bookingGroups) {
    for (const b of g.rows) {
      if (b.costAmount == null) {
        // No cost entered yet. Nothing to add, but it is not nothing: count it
        // so the page can say how much of the trip is still unpriced.
        if (g.source === 'hotel') missingCost.hotels++;
        else missingCost.transport++;
        continue;
      }
      const cur = effectiveCurrency(b.costCurrency, tripCurrency);
      if (cur !== tripCurrency) {
        excludedCount++;
        excludedCurrencies.add(cur);
        continue;
      }
      included.push({
        id: b.id,
        source: g.source,
        category: g.category,
        label: b.label,
        amount: b.costAmount,
        currency: cur,
        at: bookingDate(b),
        href: `/trip/${tripId}/bookings`,
      });
    }
  }

  const byCategory: CategoryTotal[] = EXPENSE_CATEGORIES.map((category) => ({
    category,
    amount: 0,
    count: 0,
    fromBooking: 0,
    fromExpense: 0,
  }));
  const index = new Map(byCategory.map((c) => [c.category, c]));

  for (const r of included) {
    const bucket = index.get(r.category);
    if (!bucket) continue;
    bucket.amount += r.amount;
    bucket.count += 1;
    if (r.source === 'expense') bucket.fromExpense += r.amount;
    else bucket.fromBooking += r.amount;
  }

  const totalSpent = byCategory.reduce((s, c) => s + c.amount, 0);

  const recent = [...included]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, RECENT_LIMIT);

  return {
    currency: tripCurrency,
    totalSpent,
    byCategory,
    recent,
    excluded: {
      count: excludedCount,
      currencies: [...excludedCurrencies].sort(),
    },
    missingCost,
  };
}

export async function loadBudgetForTrip(
  tripId: string,
  tripCurrency: string | null,
): Promise<BudgetSummary> {
  const [expenseRows, hotelRows, transportRows] = await Promise.all([
    db
      .select({
        id: expenses.id,
        category: expenses.category,
        label: expenses.label,
        amount: expenses.amount,
        currency: expenses.currency,
        at: expenses.at,
      })
      .from(expenses)
      .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt))),
    db
      .select({
        id: hotelBookings.id,
        label: hotelBookings.name,
        costAmount: hotelBookings.costAmount,
        costCurrency: hotelBookings.costCurrency,
        date: hotelBookings.checkInDate,
        createdAt: hotelBookings.createdAt,
      })
      .from(hotelBookings)
      .where(
        and(eq(hotelBookings.tripId, tripId), isNull(hotelBookings.deletedAt)),
      ),
    db
      .select({
        id: transportBookings.id,
        label: transportBookings.title,
        costAmount: transportBookings.costAmount,
        costCurrency: transportBookings.costCurrency,
        date: transportBookings.fromDate,
        createdAt: transportBookings.createdAt,
      })
      .from(transportBookings)
      .where(
        and(
          eq(transportBookings.tripId, tripId),
          isNull(transportBookings.deletedAt),
        ),
      ),
  ]);

  return buildBudgetSummary({
    tripId,
    tripCurrency,
    expenses: expenseRows,
    hotels: hotelRows,
    transport: transportRows,
  });
}

// Editable rows for the budget overlay. Scoped to the same window the recent
// list shows — a row the user cannot see is a row they cannot open.
export async function loadEditableExpenses(
  tripId: string,
  limit: number,
): Promise<EditableExpense[]> {
  const rows = await db
    .select({
      id: expenses.id,
      category: expenses.category,
      label: expenses.label,
      amount: expenses.amount,
      dayIdx: expenses.dayIdx,
      note: expenses.note,
      at: expenses.at,
    })
    .from(expenses)
    .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.at))
    .limit(limit);
  return rows.map(toEditableExpense);
}

// How many rows a currency switch would touch. Shown before the user confirms,
// because the honest answer to "change the trip to THB" is "and your 30
// existing USD rows drop out of the total unless we move them too" — a number,
// not a warning nobody reads.
export async function countRowsInCurrency(
  tripId: string,
  currency: string,
): Promise<number> {
  const groups = await Promise.all([
    db
      .select({ currency: expenses.currency })
      .from(expenses)
      .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt))),
    // Bookings with no cost entered carry a currency but no money, so
    // relabelling them changes nothing — counting them would overstate what
    // the user is being asked to confirm.
    db
      .select({ currency: hotelBookings.costCurrency })
      .from(hotelBookings)
      .where(
        and(
          eq(hotelBookings.tripId, tripId),
          isNull(hotelBookings.deletedAt),
          isNotNull(hotelBookings.costAmount),
        ),
      ),
    db
      .select({ currency: transportBookings.costCurrency })
      .from(transportBookings)
      .where(
        and(
          eq(transportBookings.tripId, tripId),
          isNull(transportBookings.deletedAt),
          isNotNull(transportBookings.costAmount),
        ),
      ),
  ]);

  // Null-currency booking rows already follow the trip currency wherever it
  // goes, so they need no migration and must not inflate the count.
  return groups
    .flat()
    .filter((r) => (r.currency ?? '').trim().toUpperCase() === currency).length;
}

// The trip's currency for callers that need only that (the bookings page, the
// booking/expense forms) and are not already loading the rows.
export async function loadTripCurrency(
  tripId: string,
  explicit: string | null,
): Promise<string> {
  if (explicit) return explicit;
  const [e, h, t] = await Promise.all([
    db
      .select({ c: expenses.currency })
      .from(expenses)
      .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt))),
    db
      .select({ c: hotelBookings.costCurrency })
      .from(hotelBookings)
      .where(
        and(eq(hotelBookings.tripId, tripId), isNull(hotelBookings.deletedAt)),
      ),
    db
      .select({ c: transportBookings.costCurrency })
      .from(transportBookings)
      .where(
        and(
          eq(transportBookings.tripId, tripId),
          isNull(transportBookings.deletedAt),
        ),
      ),
  ]);
  return resolveTripCurrency(explicit, [...e, ...h, ...t].map((r) => r.c));
}
