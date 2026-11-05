// /api/v1/notes/:noteId/items/order — PUT { order: [itemId, …] } ([API-CHK]):
// every item of the note exactly once, in the new order -> { items }.

import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { reorderChecklistItems } from '@/lib/services/note-service';

type Ctx = { params: Promise<{ noteId: string }> };

export function PUT(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { noteId } = await ctx.params;
    const body = await readJsonBody(req);
    const { items } = await reorderChecklistItems(userId, noteId, body.order);
    return apiJson({ items });
  });
}
