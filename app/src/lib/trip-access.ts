// Trip-access helpers. Owner OR member-with-role check.
// Phase 8: introduced. Mutation actions still owner-scoped for safety;
// per-action role enforcement rolls out incrementally.

import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { trips, tripMemberships } from '@/db/schema';

export type TripRole = 'owner' | 'editor' | 'viewer';

export async function getTripRole(
  tripId: string,
  userId: string,
): Promise<TripRole | null> {
  const tripRow = await db
    .select({ ownerId: trips.ownerId })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!tripRow[0]) return null;
  if (tripRow[0].ownerId === userId) return 'owner';

  const memRow = await db
    .select({ role: tripMemberships.role })
    .from(tripMemberships)
    .where(
      and(
        eq(tripMemberships.tripId, tripId),
        eq(tripMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!memRow[0]) return null;
  return memRow[0].role as 'editor' | 'viewer';
}

export function canWrite(role: TripRole | null): boolean {
  return role === 'owner' || role === 'editor';
}

export function canManageInvites(role: TripRole | null): boolean {
  return role === 'owner';
}
