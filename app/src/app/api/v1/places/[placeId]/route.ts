// /api/v1/places/:placeId
//   PATCH  -> merge-patch a place (TP-0145): absent = unchanged, null = clear
//             ("name"/"kind" cannot be cleared; lat/lng go together). The pin
//             re-resolves only on a googleMapsUrl or a changed address sent
//             without lat/lng; a failed re-resolve keeps the stored pin.
//             `arrive` is tri-state: absent = leg untouched, null = clear,
//             object = set the leg into this place.
//   DELETE -> remove a place (re-indexes survivors + realigns segments)

import { patchPlace, readPlaceFields, removePlace } from '@/lib/services/place-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { parsePlacePatch, readPlaceLink } from '@/lib/api/place-input';
import { LinkBudget, type PlaceLinkWarning } from '@/lib/api/place-link';
import { resolvePlacePatch } from '@/lib/api/place-patch';
import { readArrive } from '@/lib/api/arrive-input';
import { transitAsPlaceWarning, type LegWarning } from '@/lib/api/leg-warnings';

type Ctx = { params: Promise<{ placeId: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { placeId } = await ctx.params;
    const body = await readJsonBody(req);
    const parsed = parsePlacePatch(body);
    const arrive = readArrive(body);
    const link = readPlaceLink(body);
    // Link resolution (network) stays outside the tx.
    const existing = await readPlaceFields(userId, placeId);
    const resolved = await resolvePlacePatch(existing, parsed, link, new LinkBudget(userId));
    const warnings: (PlaceLinkWarning | LegWarning)[] = [...resolved.warnings];
    const transit = transitAsPlaceWarning(resolved.merged, link);
    if (transit) warnings.push(transit);

    const out = await patchPlace(userId, placeId, resolved.patch, arrive);
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
