// /api/v1/places/:placeId
//   PATCH  -> full-replace a place's fields (all fields; "name" required)
//   DELETE -> remove a place (re-indexes survivors + realigns segments)

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { places } from '@/db/schema';
import { updatePlace, removePlace } from '@/lib/services/place-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { parsePlaceFields } from '@/lib/api/place-input';

type Ctx = { params: Promise<{ placeId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { placeId } = await ctx.params;
    const fields = parsePlaceFields(await readJsonBody(req));
    await updatePlace(userId, placeId, fields);
    const [place] = await db
      .select()
      .from(places)
      .where(eq(places.id, placeId))
      .limit(1);
    return apiJson({ place });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { placeId } = await ctx.params;
    const { tripId } = await removePlace(userId, placeId);
    return apiJson({ ok: true, tripId });
  });
}
