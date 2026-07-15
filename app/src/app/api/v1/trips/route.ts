// /api/v1/trips
//   GET  -> list the caller's trips (owner-scoped)
//   POST -> create a trip (Idempotency-Key aware)

import { eq } from 'drizzle-orm';
import { trips as tripsTable } from '@/db/schema';
import { loadTripsForOwner } from '@/lib/trip-queries';
import { createTrip } from '@/lib/services/trip-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody, reqString, optString } from '@/lib/api/http';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';

export function GET(req: Request) {
  return withUser(req, async (userId) => {
    const trips = await loadTripsForOwner(userId);
    return apiJson({ trips });
  });
}

export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const body = await readJsonBody(req);
    const input = {
      title: reqString(body, 'title'),
      subtitle: optString(body, 'subtitle'),
      startDate: optString(body, 'startDate'),
      endDate: optString(body, 'endDate'),
      cover: optString(body, 'cover'),
    };
    return withIdempotencyAtomic(userId, req, body, async (tx) => {
      const { id } = await createTrip(userId, input, tx);
      const [trip] = await tx
        .select()
        .from(tripsTable)
        .where(eq(tripsTable.id, id))
        .limit(1);
      return { status: 201, body: { trip } };
    });
  });
}
