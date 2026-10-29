// One headcount for every per-person number: the trip hub, the budget page
// and the per_person budget basis. An explicit `budgetConfig.travelers` wins;
// otherwise owner + editors.

import { and, count, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { tripMemberships } from '@/db/schema';
import type { TripBudgetConfig } from '@/db/schema';

export function resolveTravelers(
  explicit: number | null | undefined,
  editorCount: number,
): number {
  return explicit ?? editorCount + 1;
}

// "per person" and "per day" are ways of entering a budget, not separate
// budgets — multiply back out to one comparable number. A per-day budget on a
// trip with no days yet has no meaningful multiplier, so it resolves to null
// (no budget bar) rather than to the raw amount, which would read as a
// one-day budget.
export function resolveBudgetTarget(
  cfg: TripBudgetConfig | null,
  travelers: number,
  realDays: number,
): number | null {
  const target = cfg?.amount ?? null;
  if (cfg == null || target == null) return null;
  if (cfg.basis === 'per_person') return target * travelers;
  if (cfg.basis === 'per_day') return realDays > 0 ? target * realDays : null;
  return target;
}

export async function loadTravelersCount(trip: {
  id: string;
  ownerId: string;
  budgetConfig: TripBudgetConfig | null;
}): Promise<number> {
  const explicit = trip.budgetConfig?.travelers;
  if (explicit != null) return explicit;
  return resolveTravelers(null, await countEditors(trip));
}

// Editor memberships, excluding the owner. Callers that also need the
// fallback (e.g. as the form placeholder) use this with resolveTravelers.
export async function countEditors(trip: { id: string; ownerId: string }): Promise<number> {
  // Real members, not the collaborators jsonb — that column holds
  // {initials, color} for drawing avatars and has nothing to do with who is
  // actually on the trip. Viewers are excluded: someone who can only look at
  // the plan is not a head the per-person budget divides by.
  const [row] = await db
    .select({ c: count() })
    .from(tripMemberships)
    .where(
      and(
        eq(tripMemberships.tripId, trip.id),
        // The role enum is editor|viewer only — the owner is the +1.
        eq(tripMemberships.role, 'editor'),
        // The owner is counted once, as the +1. Today no path creates a
        // membership row for them (acceptInvite skips the owner outright),
        // but excluding them here means a future path that does cannot
        // silently double the head count the per-person budget divides by.
        ne(tripMemberships.userId, trip.ownerId),
      ),
    );
  return row?.c ?? 0;
}
