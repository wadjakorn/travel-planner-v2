// /api/v1/places/:placeId
//   PATCH  -> full-replace a place's fields (all fields; "name" required).
//             `arrive` is tri-state: absent = leg untouched, null = clear,
//             object = set the leg into this place.
//   DELETE -> remove a place (re-indexes survivors + realigns segments)

import { eq } from 'drizzle-orm';
import { dbNode } from '@/db';
import { places } from '@/db/schema';
import { updatePlace, removePlace } from '@/lib/services/place-service';
import { resolvePlaceWrite } from '@/lib/services/access';
import { applyPlaceArrive, lockDay, readArriveView } from '@/lib/services/leg-service';
import { touchTrip } from '@/lib/touch-trip';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { parsePlaceFields, readPlaceLink } from '@/lib/api/place-input';
import { applyPlaceLink, LinkBudget, type PlaceLinkWarning } from '@/lib/api/place-link';
import { readArrive } from '@/lib/api/arrive-input';
import { transitAsPlaceWarning, type LegWarning } from '@/lib/api/leg-warnings';
import { apiPlaceView } from '@/lib/places/google-sync';

type Ctx = { params: Promise<{ placeId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { placeId } = await ctx.params;
    const body = await readJsonBody(req);
    const parsed = parsePlaceFields(body);
    const arrive = readArrive(body);
    const link = readPlaceLink(body);
    // Link resolution (network) stays outside the tx.
    const resolved = await applyPlaceLink(parsed, link, new LinkBudget(userId));
    const { fields } = resolved;
    const warnings: (PlaceLinkWarning | LegWarning)[] = [...resolved.warnings];
    const transit = transitAsPlaceWarning(fields, link);
    if (transit) warnings.push(transit);

    const out = await dbNode.transaction(async (tx) => {
      if (arrive !== undefined) {
        // Day lock first (same order as reorder/remove: day -> place rows).
        const owned = await resolvePlaceWrite(userId, placeId, tx);
        await lockDay(tx, owned.dayId);
      }
      const { tripId } = await updatePlace(userId, placeId, fields, { deferTouch: true }, tx);
      if (arrive !== undefined) await applyPlaceArrive(tx, placeId, arrive);
      const [place] = await tx
        .select()
        .from(places)
        .where(eq(places.id, placeId))
        .limit(1);
      return {
        tripId,
        place: place
          ? { ...apiPlaceView(place, new Date()), arrive: await readArriveView(tx, placeId) }
          : place,
      };
    });
    await touchTrip(out.tripId);
    return apiJson({ place: out.place, warnings });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { placeId } = await ctx.params;
    const { tripId } = await removePlace(userId, placeId);
    return apiJson({ ok: true, tripId });
  });
}
