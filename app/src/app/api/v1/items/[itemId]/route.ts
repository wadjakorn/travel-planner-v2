// /api/v1/items/:itemId — PATCH (text/done), DELETE (re-indexes survivors)

import { updateChecklistItem, removeChecklistItem } from '@/lib/services/note-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';

type Ctx = { params: Promise<{ itemId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { itemId } = await ctx.params;
    const item = await updateChecklistItem(userId, itemId, await readJsonBody(req));
    return apiJson({ item });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { itemId } = await ctx.params;
    return apiJson(await removeChecklistItem(userId, itemId).then((r) => ({ ok: true, ...r })));
  });
}
