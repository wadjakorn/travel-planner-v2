'use server';

// Budget settings for a trip: the currency everything is compared in, and the
// budget target itself. Both live on the trip row (currency + budgetConfig
// jsonb), following the collaborators/recco precedent — no new table.

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  expenses,
  hotelBookings,
  transportBookings,
  trips,
  EXPENSE_CATEGORIES,
} from '@/db/schema';
import type {
  BudgetBasis,
  ExpenseCategory,
  TripBudgetConfig,
} from '@/db/schema';
import { requireTripWrite } from '@/lib/with-trip-auth';
import { normalizeCurrencyRequired, CurrencyFormatError } from '@/lib/currency';
import { trimOrNull, parseNumber } from '@/lib/form-parsers';

const BASES: BudgetBasis[] = ['total', 'per_person', 'per_day'];

function parseBasis(v: FormDataEntryValue | null): BudgetBasis {
  if (typeof v === 'string' && (BASES as string[]).includes(v)) {
    return v as BudgetBasis;
  }
  throw new Error('Invalid budget basis');
}

// jsonb enforces nothing, so cap keys are checked against the enum here or not
// at all. A cap stored under "hotel" instead of "hotels" would be accepted by
// Postgres, apply to nothing, and give the user no way to tell.
function parseCaps(formData: FormData): TripBudgetConfig['caps'] {
  const caps: Partial<Record<ExpenseCategory, number>> = {};
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith('cap_')) continue;
    const category = key.slice(4);
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      throw new Error(`Unknown budget category "${category}"`);
    }
    const amount = parseNumber(raw);
    if (amount === null) continue; // blank field = no cap
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Invalid cap for "${category}"`);
    }
    caps[category as ExpenseCategory] = amount;
  }
  return Object.keys(caps).length > 0 ? caps : undefined;
}

export async function saveTripBudgetAction(formData: FormData): Promise<void> {
  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) throw new Error('tripId required');
  await requireTripWrite(tripId);

  const [trip] = await db
    .select({ currency: trips.currency })
    .from(trips)
    .where(and(eq(trips.id, tripId), isNull(trips.deletedAt)))
    .limit(1);
  if (!trip) throw new Error('Trip not found');

  let currency: string;
  try {
    currency = normalizeCurrencyRequired(
      formData.get('currency'),
      trip.currency,
    );
  } catch (e) {
    if (e instanceof CurrencyFormatError) {
      throw new Error('Currency must be a 3-letter code, e.g. USD');
    }
    throw e;
  }

  const amount = parseNumber(formData.get('amount'));
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error('Budget amount must be a positive number');
  }
  const budgetConfig: TripBudgetConfig | null =
    amount === null || amount === 0
      ? null
      : { amount, basis: parseBasis(formData.get('basis')), caps: parseCaps(formData) };

  // ── INVARIANT (M11) ───────────────────────────────────────────────────────
  // This is the first action in the app that writes to `trip` outside
  // create/delete. The calendar resolves itinerary dates as
  // `trips.startDate + days.idx`, which only holds while startDate is
  // immutable after the days are seeded. So: name every column explicitly,
  // never spread a caller-supplied object into .set(), and never write
  // startDate here. Letting startDate change needs a matching day re-seed —
  // a different piece of work.
  await db
    .update(trips)
    .set({ currency, budgetConfig, updatedAt: new Date() })
    .where(eq(trips.id, tripId));

  // Opt-in relabelling of existing rows. Amounts are NOT converted — this
  // says "these numbers were always THB, we just had the label wrong",
  // which is the actual situation for a Thai user whose rows all carry the
  // 'USD' column default. Without it the total silently drops to zero.
  const migrate = formData.get('migrateCurrency') === 'on';
  if (migrate && currency !== trip.currency) {
    const from = trip.currency;
    await Promise.all([
      db
        .update(expenses)
        .set({ currency })
        .where(
          and(
            eq(expenses.tripId, tripId),
            isNull(expenses.deletedAt),
            eq(sql`upper(${expenses.currency})`, from),
          ),
        ),
      db
        .update(hotelBookings)
        .set({ costCurrency: currency })
        .where(
          and(
            eq(hotelBookings.tripId, tripId),
            isNull(hotelBookings.deletedAt),
            eq(sql`upper(${hotelBookings.costCurrency})`, from),
          ),
        ),
      db
        .update(transportBookings)
        .set({ costCurrency: currency })
        .where(
          and(
            eq(transportBookings.tripId, tripId),
            isNull(transportBookings.deletedAt),
            eq(sql`upper(${transportBookings.costCurrency})`, from),
          ),
        ),
    ]);
  }

  revalidatePath(`/trip/${tripId}/budget`);
  revalidatePath(`/trip/${tripId}/bookings`);
}
