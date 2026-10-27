// POST /api/v1/trips/import — create a whole trip (days + places + hotels) from
// an agent-authored plan, atomically and idempotently. Auth/scope/rate-limit
// come from withUser; the atomic idempotency flow lives in importTripIdempotent.

import { withUser, readJsonBody } from '@/lib/api/http';
import { importTripIdempotent } from '@/lib/api/import-orchestrator';
import { ServiceError } from '@/lib/services/service-error';

// importPlan runs its transaction over the postgres-js dbNode (TCP) client,
// which cannot run on Edge. Pin Node so this route is never flipped to Edge.
export const runtime = 'nodejs';

export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const body = await readJsonBody(req);
    // dryRun=true previews the plan (validate + resolve links, write nothing)
    // without consuming an idempotency key. Default is a real import. Reject a
    // non-boolean dryRun with 400 rather than coercing — a truthy string like
    // "true" must never silently fall through to a REAL import/write.
    if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
      throw new ServiceError('bad_request', '"dryRun" must be a boolean');
    }
    const dryRun = body.dryRun === true;
    return importTripIdempotent(userId, req, body, undefined, dryRun);
  });
}
