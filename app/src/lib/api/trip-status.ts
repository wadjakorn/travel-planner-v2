// Pure helpers for GET/PATCH /api/v1/trips/:id status + sourceUrl surfacing
// (TP-0042/TP-0043). Kept out of the route module so they are unit-testable
// without the neon-bound loaders the handlers use.

import { ServiceError } from '@/lib/services/service-error';
import { parseHttpUrl } from '@/lib/api/place-input';

export type TripStatusFilter = 'confirmed' | 'tbd';

// Optional ?status=tbd|confirmed filter on GET. The enum is validated so a typo
// is a 400, not a silently-empty itinerary. Absent → null (no filter).
export function readStatusFilter(req: Request): TripStatusFilter | null {
  const raw = new URL(req.url).searchParams.get('status');
  if (raw === null) return null;
  if (raw !== 'confirmed' && raw !== 'tbd') {
    throw new ServiceError('bad_request', '"status" filter must be one of: confirmed, tbd');
  }
  return raw;
}

// trip.source_url on PATCH: absent → leave untouched (undefined), null/'' →
// clear (null), a value → scheme-validated http(s) URL (javascript:/data: → 400).
export function readTripSourceUrl(body: Record<string, unknown>): string | null | undefined {
  if (!('sourceUrl' in body)) return undefined;
  return parseHttpUrl(body.sourceUrl);
}

type PlaceStatusView = { status?: string | null };

// tbdCount counts the WHOLE trip (before any filter) so an agent can see how
// much planning is still open regardless of the view; `days` are filtered to
// the requested status when one is given. Generic over the day/place shape so
// it stays decoupled from loadApiTrip's exact types.
export function summarizeTripStatus<P extends PlaceStatusView, D extends { places: P[] }>(
  days: D[],
  statusFilter: TripStatusFilter | null,
): { tbdCount: number; days: D[] } {
  const tbdCount = days.reduce(
    (n, d) => n + d.places.filter((p) => p.status === 'tbd').length,
    0,
  );
  const filtered = statusFilter
    ? days.map((d) => ({ ...d, places: d.places.filter((p) => p.status === statusFilter) }))
    : days;
  return { tbdCount, days: filtered };
}
