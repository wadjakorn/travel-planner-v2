// /api/v1/trips/:tripId/hotels — GET list, POST create (idempotent)

import { listHotels, createHotel } from '@/lib/services/booking-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';

type Ctx = { params: Promise<{ tripId: string }> };

export function GET(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    return apiJson({ hotels: await listHotels(userId, tripId) });
  });
}

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    const body = await readJsonBody(req);
    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const hotel = await createHotel(userId, tripId, body, tx);
      return { status: 201, body: { hotel } };
    });
  });
}
