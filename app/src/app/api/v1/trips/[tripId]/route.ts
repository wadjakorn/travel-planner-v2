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

type Ctx = { params: Promise<{ tripId: string }> };

export function GET(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    await requireTripAccess(userId, tripId, 'read');
    const trip = await loadApiTrip(tripId);
    if (!trip) throw new ServiceError('not_found', 'Trip not found');
    return apiJson({ trip });
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
    };
    await updateTrip(userId, tripId, input);
    const trip = await loadTripBasic(tripId);
    return apiJson({ trip });
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
