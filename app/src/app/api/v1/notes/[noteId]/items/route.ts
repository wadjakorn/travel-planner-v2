// /api/v1/notes/:noteId/items — POST add a checklist item (idempotent)

import { addChecklistItem } from '@/lib/services/note-service';
import { withUser, readJsonBody } from '@/lib/api/http';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

type Ctx = { params: Promise<{ noteId: string }> };

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { noteId } = await ctx.params;
    const body = await readJsonBody(req);
    return withIdempotency(userId, idempotencyKey(req), async () => {
      const item = await addChecklistItem(userId, noteId, body);
      return { status: 201, body: { item } };
    });
  });
}
