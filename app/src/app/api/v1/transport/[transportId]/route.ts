// /api/v1/transport/:transportId — PATCH update, DELETE (soft)

import { updateTransport, removeTransport } from '@/lib/services/booking-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';

type Ctx = { params: Promise<{ transportId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { transportId } = await ctx.params;
    const transport = await updateTransport(userId, transportId, await readJsonBody(req));
    return apiJson({ transport });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { transportId } = await ctx.params;
    return apiJson(await removeTransport(userId, transportId).then((r) => ({ ok: true, ...r })));
  });
}
