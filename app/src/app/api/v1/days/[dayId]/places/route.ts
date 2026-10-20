// /api/v1/days/:dayId/places
//   POST -> append a place to the day (Idempotency-Key aware)

import { eq } from 'drizzle-orm';
import { places } from '@/db/schema';
import { addPlace } from '@/lib/services/place-service';
import { withUser, readJsonBody } from '@/lib/api/http';
import { parsePlaceFields, readPlaceLink } from '@/lib/api/place-input';
import { applyPlaceLink, LinkBudget } from '@/lib/api/place-link';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import { apiPlaceView } from '@/lib/places/google-sync';

type Ctx = { params: Promise<{ dayId: string }> };

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { dayId } = await ctx.params;
    const body = await readJsonBody(req);
    const parsed = parsePlaceFields(body);
    const { fields, warnings } = await applyPlaceLink(parsed, readPlaceLink(body), new LinkBudget(userId));
    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const { id } = await addPlace(userId, dayId, fields, tx);
      const [place] = await tx
        .select()
        .from(places)
        .where(eq(places.id, id))
        .limit(1);
      // Stripped inside the callback: this body is stored for the
      // Idempotency-Key and replayed verbatim.
      return { status: 201, body: { place: apiPlaceView(place, new Date()), warnings } };
    });
  });
}
