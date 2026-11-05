// /api/v1/trips/:tripId/invites ([API-MEM]) — owner only.
//   GET  -> { invites: [{ id, email, role, status, expiresAt, createdAt }] }
//   POST { email, role? } -> 201 { invite, url }. `url` carries the one-time
//        token (only its hash is stored), so it is returned once and is NOT
//        replayed via Idempotency-Key: a retry makes a second pending invite.

import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { createInvite, listInvites } from '@/lib/services/invite-service';
import { absoluteUrl } from '@/lib/site-url';

type Ctx = { params: Promise<{ tripId: string }> };

export function GET(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    return apiJson({ invites: await listInvites(userId, tripId) });
  });
}

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    const body = await readJsonBody(req);
    const { invite, token } = await createInvite(userId, tripId, { email: body.email, role: body.role });
    return apiJson({ invite, url: absoluteUrl(`/invite/${token}`) }, 201);
  });
}
