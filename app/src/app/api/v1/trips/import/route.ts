// POST /api/v1/trips/import — create a whole trip (days + places + hotels) from
// an agent-authored plan, atomically. Always creates a NEW trip. Read-write
// scope + per-token rate limit come from withUser; retries are safe via the
// Idempotency-Key header. The importPlan service runs every insert in one
// transaction, so a bad payload (400) writes nothing.

import { withUser, readJsonBody } from '@/lib/api/http';
import { withIdempotency } from '@/lib/api/idempotency';
import { parseImportPlan } from '@/lib/api/import-input';
import { importPlan } from '@/lib/services/import-service';
import { loadApiTrip } from '@/lib/trip-queries';

export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const body = await readJsonBody(req);
    return withIdempotency(userId, req, body, async () => {
      const plan = parseImportPlan(body);
      const { id } = await importPlan(userId, plan);
      const trip = await loadApiTrip(id);
      return { status: 201, body: { trip } };
    });
  });
}
