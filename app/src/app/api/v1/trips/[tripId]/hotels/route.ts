// /api/v1/trips/:tripId/hotels — GET list, POST create (idempotent)

import { listHotels, createHotel } from '@/lib/services/booking-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { withIdempotency } from '@/lib/api/idempotency';

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
    return withIdempotency(userId, req, body, async () => {
      const hotel = await createHotel(userId, tripId, body);
      return { status: 201, body: { hotel } };
    });
  });
}
