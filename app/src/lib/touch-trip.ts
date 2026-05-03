// Bump trip.updatedAt so the SavedAgo indicator reflects the most recent
// server-acked write. Call this from every mutation server action that
// changes trip-scoped data.

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { trips } from '@/db/schema';

export async function touchTrip(tripId: string): Promise<void> {
  await db
    .update(trips)
    .set({ updatedAt: new Date() })
    .where(eq(trips.id, tripId));
}
