// /api/v1/trips/:tripId/transport — GET list, POST create (idempotent)

import { listTransport, createTransport } from '@/lib/services/booking-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import { prepareTransportCreate } from '@/lib/api/transport-link';

type Ctx = { params: Promise<{ tripId: string }> };

export function GET(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    return apiJson({ transport: await listTransport(userId, tripId) });
  });
}

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    const body = await readJsonBody(req);
    // Resolve outside the tx; the original body stays the idempotency hash input.
    const prep = await prepareTransportCreate(userId, tripId, body);
    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const transport = await createTransport(userId, tripId, prep.body, tx);
      return { status: 201, body: { transport, warnings: prep.warnings } };
    });
  });
}
