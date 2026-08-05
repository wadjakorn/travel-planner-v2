'use server';

// Budget settings for a trip: the currency everything is compared in, and the
// budget target itself. Both live on the trip row (currency + budgetConfig
// jsonb), following the collaborators/recco precedent — no new table.

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, dbNode } from '@/db';
import { expenses, hotelBookings, transportBookings, trips } from '@/db/schema';
import type { TripBudgetConfig } from '@/db/schema';
import { parseBudgetConfig } from '@/lib/budget-config';
import { loadTripCurrency } from '@/lib/expense-queries';
import { requireTripWrite } from '@/lib/with-trip-auth';
import { normalizeCurrencyRequired, CurrencyFormatError } from '@/lib/currency';
import { trimOrNull } from '@/lib/form-parsers';
import { actionError, actionOk, type ActionResult } from '@/lib/action-result';

export async function saveTripBudgetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const tripId = trimOrNull(formData.get('tripId'));
  if (!tripId) return actionError('Missing trip.');
  try {
    await requireTripWrite(tripId);
  } catch (err) {
    // Stale session or a role change since the page rendered: the form should
    // say so, not hand the user a redacted server error.
    return actionError(
      err instanceof Error && err.message === 'Forbidden'
        ? 'You do not have permission to change this trip.'
        : 'Your session expired. Sign in again to save this.',
    );
  }

  const [trip] = await db
    .select({ currency: trips.currency })
    .from(trips)
    .where(and(eq(trips.id, tripId), isNull(trips.deletedAt)))
    .limit(1);
  if (!trip) throw new Error('Trip not found');

  // The currency the trip reads as today — the stored one, or the one inferred
  // from its rows while nothing has been chosen. Saving the form is what turns
  // that inference into an explicit choice, and the relabel prompt below has
  // to compare against what the user was actually shown.
  const current = await loadTripCurrency(tripId, trip.currency);

  let currency: string;
  try {
    currency = normalizeCurrencyRequired(formData.get('currency'), current);
  } catch (e) {
    if (e instanceof CurrencyFormatError) {
      return actionError('Currency must be a 3-letter code, e.g. USD');
    }
    throw e;
  }

  const budgetConfig: TripBudgetConfig | null = parseBudgetConfig(formData);

  // ── INVARIANT (M11) ───────────────────────────────────────────────────────
  // This is the first action in the app that writes to `trip` outside
  // create/delete. The calendar resolves itinerary dates as
  // `trips.startDate + days.idx`, which only holds while startDate is
  // immutable after the days are seeded. So: name every column explicitly,
  // never spread a caller-supplied object into .set(), and never write
  // startDate here. Letting startDate change needs a matching day re-seed —
  // a different piece of work.
  //
  // The trip row and the relabelling below move together or not at all:
  // switching the trip to THB but failing partway through the UPDATEs would
  // strand rows on the old currency and drop them out of the total — exactly
  // the silent zero the checkbox exists to prevent. dbNode (postgres-js over
  // TCP) is used because the neon-http driver has no transaction support.
  //
  // Relabelling is opt-in and never converts amounts: it says "these numbers
  // were always THB, the label was wrong", which is the real situation for a
  // Thai user whose rows all carry the 'USD' column default.
  const migrate =
    formData.get('migrateCurrency') === 'on' && currency !== current;
  const from = current;

  await dbNode.transaction(async (tx) => {
    await tx
      .update(trips)
      .set({ currency, budgetConfig, updatedAt: new Date() })
      .where(eq(trips.id, tripId));

    if (!migrate) return;

    await tx
      .update(expenses)
      .set({ currency })
      .where(
        and(
          eq(expenses.tripId, tripId),
          isNull(expenses.deletedAt),
          eq(sql`upper(${expenses.currency})`, from),
        ),
      );
    await tx
      .update(hotelBookings)
      .set({ costCurrency: currency })
      .where(
        and(
          eq(hotelBookings.tripId, tripId),
          isNull(hotelBookings.deletedAt),
          eq(sql`upper(${hotelBookings.costCurrency})`, from),
        ),
      );
    await tx
      .update(transportBookings)
      .set({ costCurrency: currency })
      .where(
        and(
          eq(transportBookings.tripId, tripId),
          isNull(transportBookings.deletedAt),
          eq(sql`upper(${transportBookings.costCurrency})`, from),
        ),
      );
  });

  revalidatePath(`/trip/${tripId}/budget`);
  revalidatePath(`/trip/${tripId}/bookings`);
  revalidatePath(`/trip/${tripId}/settings`);

  return actionOk('Budget saved');
}
