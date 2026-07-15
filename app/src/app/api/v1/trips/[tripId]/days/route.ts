// /api/v1/trips/:tripId/days
//   POST -> append a day to the trip (Idempotency-Key aware)

import { eq } from 'drizzle-orm';
import { days } from '@/db/schema';
import { addDay } from '@/lib/services/day-service';
import { withUser } from '@/lib/api/http';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';

type Ctx = { params: Promise<{ tripId: string }> };

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { tripId } = await ctx.params;
    return withIdempotencyAtomic(userId, req, {}, async (tx) => {
      const { id } = await addDay(userId, tripId, tx);
      const [day] = await tx.select().from(days).where(eq(days.id, id)).limit(1);
      return { status: 201, body: { day } };
    });
  });
}
