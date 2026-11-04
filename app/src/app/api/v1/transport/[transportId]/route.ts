// /api/v1/transport/:transportId — PATCH update, DELETE (soft)

import { removeTransport } from '@/lib/services/booking-service';
import { patchTransport } from '@/lib/api/transport-link';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';

type Ctx = { params: Promise<{ transportId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { transportId } = await ctx.params;
    return apiJson(await patchTransport(userId, transportId, await readJsonBody(req)));
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { transportId } = await ctx.params;
    return apiJson(await removeTransport(userId, transportId).then((r) => ({ ok: true, ...r })));
  });
}
