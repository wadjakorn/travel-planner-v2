// /api/v1/trips/:tripId/days
//   POST -> append a day to the trip (Idempotency-Key aware)

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { days } from '@/db/schema';
import { addDay } from '@/lib/services/day-service';
import { withUser } from '@/lib/api/http';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

type Ctx = { params: Promise<{ tripId: string }> };

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    return withIdempotency(userId, idempotencyKey(req), async () => {
      const { id } = await addDay(userId, tripId);
      const [day] = await db.select().from(days).where(eq(days.id, id)).limit(1);
      return { status: 201, body: { day } };
    });
  });
}
