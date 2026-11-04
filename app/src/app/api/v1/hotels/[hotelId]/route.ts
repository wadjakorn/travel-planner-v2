// /api/v1/hotels/:hotelId — PATCH update, DELETE (soft)

import { removeHotel } from '@/lib/services/booking-service';
import { patchHotel } from '@/lib/api/hotel-link';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';

type Ctx = { params: Promise<{ hotelId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { hotelId } = await ctx.params;
    return apiJson(await patchHotel(userId, hotelId, await readJsonBody(req)));
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { hotelId } = await ctx.params;
    return apiJson(await removeHotel(userId, hotelId).then((r) => ({ ok: true, ...r })));
  });
}
