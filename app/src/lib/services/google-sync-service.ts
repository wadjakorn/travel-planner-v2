// Daily purge of expired Google rating/reviews/hours (TP-0047, resync design
// §5). Read paths already hide expired values via visibleVolatile; this
// removes them from storage. Runs regardless of MAPS_PROVIDER.
//
// No deleted_at filter (soft-deleted rows must not keep Google data either),
// no updated_at bump and no touchTrip: this is housekeeping, not a user edit.

import 'server-only';
import { lt } from 'drizzle-orm';
import { db } from '@/db';
import { places } from '@/db/schema';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { VOLATILE_TTL_MS } from '@/lib/places/google-sync';

export async function purgeExpiredVolatile(
  now: Date,
  exec: IdemExecutor = db,
): Promise<{ rating: number; hours: number }> {
  const cutoff = new Date(now.getTime() - VOLATILE_TTL_MS);
  const rating = await (exec as typeof db)
    .update(places)
    .set({ rating: null, reviews: null, ratingSyncedAt: null })
    .where(lt(places.ratingSyncedAt, cutoff))
    .returning({ id: places.id });
  const hours = await (exec as typeof db)
    .update(places)
    .set({ hours: null, hoursSyncedAt: null })
    .where(lt(places.hoursSyncedAt, cutoff))
    .returning({ id: places.id });
  return { rating: rating.length, hours: hours.length };
}
