// Trip-access helpers. Owner OR member-with-role check.
// Phase 8: introduced. Mutation actions still owner-scoped for safety;
// per-action role enforcement rolls out incrementally.

import { cache } from 'react';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { trips, tripMemberships } from '@/db/schema';
import type { IdemExecutor } from '@/lib/api/idempotency';

export type TripRole = 'owner' | 'editor' | 'viewer';

// Uncached role resolver that accepts an executor, so a mutation running inside
// a dbNode transaction (API-IDEM atomic completion) can resolve authz on the
// same tx. `getTripRole` below keeps the request-cached, module-`db` behavior
// for all existing (page-load) callers.
export async function getTripRoleWith(
  tripId: string,
  userId: string,
  exec: IdemExecutor = db,
): Promise<TripRole | null> {
  const tripRow = await exec
    .select({ ownerId: trips.ownerId })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!tripRow[0]) return null;
  if (tripRow[0].ownerId === userId) return 'owner';

  const memRow = await exec
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

export const getTripRole = cache(async function getTripRole(
  tripId: string,
  userId: string,
): Promise<TripRole | null> {
  return getTripRoleWith(tripId, userId);
});

export function canWrite(role: TripRole | null): boolean {
  return role === 'owner' || role === 'editor';
}

export type TripPerms = {
  canEdit: boolean;
  canManageInvites: boolean;
  role: TripRole | null;
};

export function permsFor(role: TripRole | null): TripPerms {
  return {
    canEdit: canWrite(role),
    canManageInvites: role === 'owner',
    role,
  };
}

export function canManageInvites(role: TripRole | null): boolean {
  return role === 'owner';
}

export async function assertCanWrite(
  tripId: string,
  userId: string,
): Promise<TripRole> {
  const role = await getTripRole(tripId, userId);
  if (!canWrite(role)) throw new Error('Forbidden');
  return role as TripRole;
}

export async function assertCanRead(
  tripId: string,
  userId: string,
): Promise<TripRole | null> {
  return getTripRole(tripId, userId);
}
