// /api/v1/days/:dayId/places
//   POST -> append a place to the day (Idempotency-Key aware). Optional
//           `arrive` writes the leg into the new place in the same tx.

import { eq } from 'drizzle-orm';
import { db, dbNode } from '@/db';
import { places } from '@/db/schema';
import { addPlace } from '@/lib/services/place-service';
import { readArriveView } from '@/lib/services/leg-service';
import { touchTrip } from '@/lib/touch-trip';
import { withUser, readJsonBody } from '@/lib/api/http';
import { parsePlaceFields, readPlaceLink } from '@/lib/api/place-input';
import { applyPlaceLink, LinkBudget } from '@/lib/api/place-link';
import { readArrive } from '@/lib/api/arrive-input';
import { transitAsPlaceWarning, type LegWarning } from '@/lib/api/leg-warnings';
import type { PlaceLinkWarning } from '@/lib/api/place-link';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { apiPlaceView } from '@/lib/places/google-sync';

type Ctx = { params: Promise<{ dayId: string }> };

export function POST(req: Request, ctx: Ctx) {
  return withUser(req, async (userId) => {
    const { dayId } = await ctx.params;
    const body = await readJsonBody(req);
    const parsed = parsePlaceFields(body);
    const arrive = readArrive(body) ?? null;
    const link = readPlaceLink(body);
    const resolved = await applyPlaceLink(parsed, link, new LinkBudget(userId));
    const { fields } = resolved;
    const warnings: (PlaceLinkWarning | LegWarning)[] = [...resolved.warnings];
    const transit = transitAsPlaceWarning(fields, link);
    if (transit) warnings.push(transit);

    // Set on a fresh (non-replayed) create with `arrive`: addPlace then
    // leaves touchTrip to us, after the tx commits.
    let touchAfter: string | null = null;
    const create = async (tx: IdemExecutor) => {
      const { id, tripId } = await addPlace(userId, dayId, fields, tx, { arrive });
      if (arrive) touchAfter = tripId;
      const [place] = await tx
        .select()
        .from(places)
        .where(eq(places.id, id))
        .limit(1);
      // Stripped and read inside the callback: this body is stored for the
      // Idempotency-Key and replayed verbatim.
      return {
        status: 201,
        body: {
          place: { ...apiPlaceView(place, new Date()), arrive: await readArriveView(tx, id) },
          warnings,
        },
      };
    };
    const res = await withIdempotencyAtomic(userId, req, body, (exec) =>
      // No Idempotency-Key -> exec is the neon-http db; a leg write still
      // needs a dbNode tx (day lock).
      arrive && exec === db
        ? dbNode.transaction((tx) => create(tx as unknown as IdemExecutor))
        : create(exec),
    );
    if (touchAfter) await touchTrip(touchAfter);
    return res;
  });
}
