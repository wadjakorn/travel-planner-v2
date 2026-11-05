// /api/v1/trips/:tripId/plan
//   PUT -> rearrange the trip's places in one atomic call (TP-0146): update by
//          id (merge-patch), create, reorder, move across days, prune; legs via
//          `arrive`; `dryRun` returns the diff only. Idempotency-Key aware.

import { withUser, readJsonBody } from '@/lib/api/http';
import { putTripPlan } from '@/lib/api/plan-update-orchestrator';

type Ctx = { params: Promise<{ tripId: string }> };

export function PUT(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    return putTripPlan(userId, tripId, req, await readJsonBody(req));
  });
}
