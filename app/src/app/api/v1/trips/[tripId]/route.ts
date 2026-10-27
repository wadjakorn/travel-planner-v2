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
import { parseHttpUrl } from '@/lib/api/place-input';

// trip.source_url is nullable text: absent → leave untouched, null/'' → clear,
// a value → scheme-validated http(s) URL (javascript:/data: → 400). TP-0043.
function readSourceUrl(body: Record<string, unknown>): string | null | undefined {
  if (!('sourceUrl' in body)) return undefined;
  return parseHttpUrl(body.sourceUrl);
}

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

// Optional ?status=tbd|confirmed filter on the returned places (TP-0042). The
// enum is validated so a typo is a 400, not a silently-empty itinerary.
function readStatusFilter(req: Request): 'confirmed' | 'tbd' | null {
  const raw = new URL(req.url).searchParams.get('status');
  if (raw === null) return null;
  if (raw !== 'confirmed' && raw !== 'tbd') {
    throw new ServiceError('bad_request', '"status" filter must be one of: confirmed, tbd');
  }
  return raw;
}

export function GET(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    await requireTripAccess(userId, tripId, 'read');
    const statusFilter = readStatusFilter(req);
    const trip = await loadApiTrip(tripId);
    if (!trip) throw new ServiceError('not_found', 'Trip not found');
    // tbdCount summarizes the whole trip (computed before any filter) so an
    // agent can tell how much planning is still open regardless of the view.
    const tbdCount = trip.days.reduce(
      (n, d) => n + d.places.filter((p) => p.status === 'tbd').length,
      0,
    );
    const days = statusFilter
      ? trip.days.map((d) => ({ ...d, places: d.places.filter((p) => p.status === statusFilter) }))
      : trip.days;
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
      currency: readCurrency(body),
      sourceUrl: readSourceUrl(body),
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
