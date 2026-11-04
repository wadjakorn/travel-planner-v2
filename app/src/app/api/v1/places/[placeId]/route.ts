// /api/v1/places/:placeId
//   PATCH  -> full-replace a place's fields (all fields; "name" required).
//             `arrive` is tri-state: absent = leg untouched, null = clear,
//             object = set the leg into this place.
//   DELETE -> remove a place (re-indexes survivors + realigns segments)

import { patchPlace, removePlace } from '@/lib/services/place-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { parsePlaceFields, readPlaceLink } from '@/lib/api/place-input';
import { applyPlaceLink, LinkBudget, type PlaceLinkWarning } from '@/lib/api/place-link';
import { readArrive } from '@/lib/api/arrive-input';
import { transitAsPlaceWarning, type LegWarning } from '@/lib/api/leg-warnings';

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

    const out = await patchPlace(userId, placeId, fields, arrive);
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
