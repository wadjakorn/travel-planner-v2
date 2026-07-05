// /api/v1/days/:dayId
//   DELETE -> remove a day (cascades places + segments; re-indexes survivors)

import { removeDay } from '@/lib/services/day-service';
import { apiJson } from '@/lib/api-response';
import { withUser } from '@/lib/api/http';

type Ctx = { params: Promise<{ dayId: string }> };

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { dayId } = await ctx.params;
    const { tripId } = await removeDay(userId, dayId);
    return apiJson({ ok: true, tripId });
  });
}
