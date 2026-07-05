// GET /api/v1/me -> { user: { id, name, email } }
//
// Sanity endpoint that proves the bearer-token pipe end to end (ticket
// API-A). Domain routes (trips/days/places) land in ticket API-B.

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { requireApiUser } from '@/lib/api-auth';
import { apiJson, apiError, apiErrorFrom } from '@/lib/api-response';

export async function GET(req: Request) {
  try {
    const { userId } = await requireApiUser(req);
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = rows[0];
    if (!user) return apiError('not_found', 'User not found');
    return apiJson({ user });
  } catch (err) {
    return apiErrorFrom(err);
  }
}
