// /api/v1/days/:dayId/places
//   POST -> append a place to the day (Idempotency-Key aware)

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { places } from '@/db/schema';
import { addPlace } from '@/lib/services/place-service';
import { withUser, readJsonBody } from '@/lib/api/http';
import { parsePlaceFields } from '@/lib/api/place-input';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

type Ctx = { params: Promise<{ dayId: string }> };

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { dayId } = await ctx.params;
    const fields = parsePlaceFields(await readJsonBody(req));
    return withIdempotency(userId, idempotencyKey(req), async () => {
      const { id } = await addPlace(userId, dayId, fields);
      const [place] = await db
        .select()
        .from(places)
        .where(eq(places.id, id))
        .limit(1);
      return { status: 201, body: { place } };
    });
  });
}
