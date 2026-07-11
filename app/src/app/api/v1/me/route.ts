// GET /api/v1/me -> { user: { id, name, email } }
//
// Sanity endpoint that proves the bearer-token pipe end to end (ticket
// API-A). Domain routes (trips/days/places) land in ticket API-B.

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { apiJson, apiError } from '@/lib/api-response';
import { withUser } from '@/lib/api/http';

export function GET(req: Request) {
  // Routed through withUser so bearer auth + per-token rate limiting apply
  // here exactly as they do on the domain routes.
  return withUser(req, async (userId) => {
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = rows[0];
    if (!user) return apiError('not_found', 'User not found');
    return apiJson({ user });
  });
}
