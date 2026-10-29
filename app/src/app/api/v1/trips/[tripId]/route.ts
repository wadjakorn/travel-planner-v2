// /api/v1/trips/:tripId
//   GET    -> full trip (days + places + segments)
//   PATCH  -> update header fields (requires write access)
//   DELETE -> soft-delete (owner only)

import { loadApiTrip, loadTripBasic } from '@/lib/trip-queries';
import { updateTrip, deleteTrip } from '@/lib/services/trip-service';
import { apiJson } from '@/lib/api-response';
import { ServiceError } from '@/lib/services/service-error';
import { withUser, readJsonBody, optString } from '@/lib/api/http';
import { requireTripAccess } from '@/lib/api/authz';
import { parseBudgetConfigInput } from '@/lib/budget-config';
import { normalizeCurrency, CurrencyFormatError } from '@/lib/currency';
import { readStatusFilter, readTripSourceUrl, summarizeTripStatus } from '@/lib/api/trip-status';

// trips.currency is nullable text: absent → leave untouched, null/'' → clear,
// a value → normalized to a 3-letter upper code (CurrencyFormatError → 400).
function readCurrency(body: Record<string, unknown>): string | null | undefined {
  if (!('currency' in body)) return undefined;
  try {
    return normalizeCurrency(body.currency);
  } catch (e) {
    if (e instanceof CurrencyFormatError) {
      throw new ServiceError(
        'bad_request',
        '"currency" must be a 3-letter currency code (e.g. "USD")',
      );
    }
    throw e;
  }
}

type Ctx = { params: Promise<{ tripId: string }> };

export function GET(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    await requireTripAccess(userId, tripId, 'read');
    const statusFilter = readStatusFilter(req);
    const trip = await loadApiTrip(tripId);
    if (!trip) throw new ServiceError('not_found', 'Trip not found');
    // tbdCount summarizes the whole trip (before filtering); days are narrowed
    // to the requested status when one is given (TP-0042).
    const { tbdCount, days } = summarizeTripStatus(trip.days, statusFilter);
    return apiJson({ trip: { ...trip, tbdCount, days } });
  });
}

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    await requireTripAccess(userId, tripId, 'write');
    const body = await readJsonBody(req);
    const input = {
      title: optString(body, 'title') ?? undefined,
      subtitle: optString(body, 'subtitle'),
      startDate: optString(body, 'startDate'),
      endDate: optString(body, 'endDate'),
      cover: optString(body, 'cover'),
      // Agent-UX fields (TP-0040). `budget` is validated here (cap keys checked
      // against EXPENSE_CATEGORIES) so a bad shape is a 400 before any write.
      // Only written when present — `'budget' in body` lets a null clear it.
      budget: 'budget' in body ? parseBudgetConfigInput(body.budget) : undefined,
      // travelers is the trip headcount, not a budget figure: it changes only
      // when the request names it (`budget: null` keeps it too).
      keepTravelers: !(
        typeof body.budget === 'object' &&
        body.budget !== null &&
        'travelers' in body.budget
      ),
      currency: readCurrency(body),
      sourceUrl: readTripSourceUrl(body),
    };
    await updateTrip(userId, tripId, input);
    const trip = await loadTripBasic(tripId);
    // Expose the stored config under the contract's `budget` alias (GET does the
    // same via loadApiTrip); currency/sourceUrl ride along on the row spread.
    return apiJson({ trip: trip ? { ...trip, budget: trip.budgetConfig ?? null } : trip });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    await requireTripAccess(userId, tripId, 'owner');
    await deleteTrip(userId, tripId);
    return apiJson({ ok: true });
  });
}
