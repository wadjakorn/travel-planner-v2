// /api/v1/notes/:noteId — PATCH update (title/body), DELETE (soft)

import { updateNote, removeNote } from '@/lib/services/note-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';

type Ctx = { params: Promise<{ noteId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { noteId } = await ctx.params;
    const note = await updateNote(userId, noteId, await readJsonBody(req));
    return apiJson({ note });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { noteId } = await ctx.params;
    return apiJson(await removeNote(userId, noteId).then((r) => ({ ok: true, ...r })));
  });
}
