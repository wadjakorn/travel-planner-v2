// Bump trip.updatedAt so the SavedAgo indicator reflects the most recent
// server-acked write. Call this from every mutation server action that
// changes trip-scoped data.

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { trips } from '@/db/schema';
import type { IdemExecutor } from '@/lib/api/idempotency';

export async function touchTrip(
  tripId: string,
  exec: IdemExecutor = db,
): Promise<void> {
  await exec
    .update(trips)
    .set({ updatedAt: new Date() })
    .where(eq(trips.id, tripId));
}

/**
 * Best-effort `touchTrip` for after a transaction has committed. The write
 * already landed, so a failed bump must not turn it into a 500 (a client
 * retrying a non-idempotent POST would duplicate it). Logged and swallowed,
 * like `writeAudit`.
 */
export async function touchTripAfterCommit(
  tripId: string,
  exec: IdemExecutor = db,
): Promise<void> {
  try {
    await touchTrip(tripId, exec);
  } catch (err) {
    console.error('touchTrip after commit failed', tripId, err);
  }
}
