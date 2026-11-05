// /api/v1/invites/:inviteId — DELETE revokes a pending invite ([API-MEM]).
// Owner of the invite's trip only; anyone else gets 404.

import { apiJson } from '@/lib/api-response';
import { withUser } from '@/lib/api/http';
import { revokeInvite } from '@/lib/services/invite-service';

type Ctx = { params: Promise<{ inviteId: string }> };

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { inviteId } = await ctx.params;
    return apiJson({ ok: true, ...(await revokeInvite(userId, inviteId)) });
  });
}
