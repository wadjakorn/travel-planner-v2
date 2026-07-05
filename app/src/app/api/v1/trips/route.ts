// /api/v1/trips
//   GET  -> list the caller's trips (owner-scoped)
//   POST -> create a trip (Idempotency-Key aware)

import { loadTripsForOwner, loadTripBasic } from '@/lib/trip-queries';
import { createTrip } from '@/lib/services/trip-service';
import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody, reqString, optString } from '@/lib/api/http';
import { idempotencyKey, withIdempotency } from '@/lib/api/idempotency';

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
    return withIdempotency(userId, idempotencyKey(req), async () => {
      const { id } = await createTrip(userId, input);
      const trip = await loadTripBasic(id);
      return { status: 201, body: { trip } };
    });
  });
}
