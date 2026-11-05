// /api/v1/trips/:tripId/members — GET who is on the trip ([API-MEM]):
// the owner plus every trip_membership row. Any reader of the trip.

import { apiJson } from '@/lib/api-response';
import { withUser } from '@/lib/api/http';
import { listMembers } from '@/lib/services/invite-service';

type Ctx = { params: Promise<{ tripId: string }> };

export function GET(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    return apiJson(await listMembers(userId, tripId));
  });
}
