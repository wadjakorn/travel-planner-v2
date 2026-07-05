// /api/v1/trips/:tripId/transport — GET list, POST create (idempotent)

import { listTransport, createTransport } from '@/lib/services/booking-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { withIdempotency } from '@/lib/api/idempotency';

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
    return withIdempotency(userId, req, body, async () => {
      const transport = await createTransport(userId, tripId, body);
      return { status: 201, body: { transport } };
    });
  });
}
