// /api/v1/places/:placeId/arrive  (TP-0141)
//   PUT    -> set the leg into this place. Body is the ArriveInput itself:
//             { mode, durationMin?, note? }. Returns { arrive, tripId }.
//   DELETE -> clear it (segment note/duration cleared, mode kept; on the
//             day's first place all of day.start_* is cleared).

import { setPlaceArrive } from '@/lib/services/leg-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { parseArrive } from '@/lib/api/arrive-input';

type Ctx = { params: Promise<{ placeId: string }> };

export function PUT(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { placeId } = await ctx.params;
    const input = parseArrive(await readJsonBody(req), '"body"');
    const { arrive, tripId } = await setPlaceArrive(userId, placeId, input);
    return apiJson({ arrive, tripId });
  });
}

export function DELETE(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { placeId } = await ctx.params;
    const { tripId } = await setPlaceArrive(userId, placeId, null);
    return apiJson({ arrive: null, tripId });
  });
}
