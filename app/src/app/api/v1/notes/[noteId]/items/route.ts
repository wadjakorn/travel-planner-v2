// /api/v1/notes/:noteId/items — POST add a checklist item (idempotent)

import { addChecklistItem } from '@/lib/services/note-service';
import { withUser, readJsonBody } from '@/lib/api/http';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';

type Ctx = { params: Promise<{ noteId: string }> };

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { noteId } = await ctx.params;
    const body = await readJsonBody(req);
    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const item = await addChecklistItem(userId, noteId, body, tx);
      return { status: 201, body: { item } };
    });
  });
}
