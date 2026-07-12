// POST /api/v1/trips/import — create a whole trip (days + places + hotels) from
// an agent-authored plan, atomically and idempotently. Auth/scope/rate-limit
// come from withUser; the atomic idempotency flow lives in importTripIdempotent.

import { withUser, readJsonBody } from '@/lib/api/http';
import { importTripIdempotent } from '@/lib/api/import-orchestrator';

// importPlan runs its transaction over the postgres-js dbNode (TCP) client,
// which cannot run on Edge. Pin Node so this route is never flipped to Edge.
export const runtime = 'nodejs';

export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const body = await readJsonBody(req);
    return importTripIdempotent(userId, req, body);
  });
}
