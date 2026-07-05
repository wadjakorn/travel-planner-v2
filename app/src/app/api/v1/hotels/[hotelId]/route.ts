// /api/v1/hotels/:hotelId — PATCH update, DELETE (soft)

import { updateHotel, removeHotel } from '@/lib/services/booking-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';

type Ctx = { params: Promise<{ hotelId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { hotelId } = await ctx.params;
    const hotel = await updateHotel(userId, hotelId, await readJsonBody(req));
    return apiJson({ hotel });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { hotelId } = await ctx.params;
    return apiJson(await removeHotel(userId, hotelId).then((r) => ({ ok: true, ...r })));
  });
}
