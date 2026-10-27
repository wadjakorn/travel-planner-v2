// Place mutation service. Framework-agnostic — see trip-service.ts.
// FormData parsing stays in the action layer; these take typed fields.

import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { places, segments } from '@/db/schema';
import { touchTrip } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { ServiceError } from './service-error';
import { resolveDayWrite, resolvePlaceWrite, type SegmentMode } from './access';
import {
  googleSyncOnAdd,
  googleSyncOnUpdate,
  omitUnits,
  untouchedUnits,
  type FormBase,
  type GooglePick,
  type StoredSync,
} from '@/lib/places/google-sync';

export type PlaceKind = 'hotel' | 'food' | 'sight' | 'transit';

// Planning status for a place. 'confirmed' is the default; 'tbd' marks a stop
// that is still to be decided (maps to place.status, see db/schema.ts).
export type PlaceStatus = 'confirmed' | 'tbd';

export type PlaceFields = {
  kind: PlaceKind;
  // Planning status (default 'confirmed'). Written on create + full-replace
  // update; the import insert carries it through the PlaceFields spread.
  status: PlaceStatus;
  // Origin link this place was imported/derived from (http/https only; scheme
  // validated at the input boundary). Maps to place.source_url.
  sourceUrl: string | null;
  name: string;
  category: string | null;
  rating: number | null;
  reviews: number | null;
  time: string | null;
  duration: string | null;
  price: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  tags: string[] | null;
  thumb: string | null;
  note: string | null;
  lat: number | null;
  lng: number | null;
  placeIdExternal: string | null;
};

// When a place is appended after another, ensure a segment row exists at
// the previous-place idx. distance/time are placeholders the Directions
// client fills via fallback logic.
async function ensureSegmentForAppendedPlace(
  dayId: string,
  prevIdx: number,
  defaultMode: SegmentMode | null,
  exec: IdemExecutor = db,
): Promise<void> {
  if (prevIdx < 0) return;
  const existing = await exec
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.dayId, dayId), eq(segments.idx, prevIdx)))
    .limit(1);
  if (existing[0]) return;
  await exec.insert(segments).values({
    dayId,
    idx: prevIdx,
    mode: defaultMode ?? 'drive',
    distance: '',
    time: '',
  });
}

// Append a place at the end of a day.
export async function addPlace(
  userId: string,
  dayId: string,
  fields: PlaceFields,
  exec: IdemExecutor = db,
  opts?: { googlePick?: GooglePick | null; now?: Date },
): Promise<{ tripId: string; id: string }> {
  const owned = await resolveDayWrite(userId, dayId, exec);
  if (!fields.name) throw new ServiceError('bad_request', 'Name is required');

  const last = await exec
    .select({ idx: places.idx })
    .from(places)
    .where(eq(places.dayId, dayId))
    .orderBy(desc(places.idx))
    .limit(1);
  const nextIdx = (last[0]?.idx ?? -1) + 1;

  const [created] = await (exec as typeof db)
    .insert(places)
    .values({
      ...fields,
      ...googleSyncOnAdd(fields, opts?.googlePick ?? null, opts?.now ?? new Date()),
      dayId,
      idx: nextIdx,
    })
    .returning({ id: places.id });
  await ensureSegmentForAppendedPlace(dayId, nextIdx - 1, owned.defaultMode, exec);
  await touchTrip(owned.tripId, exec);
  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'add',
    entityType: 'place',
    entityId: created.id,
    after: { name: fields.name, kind: fields.kind },
  });

  return { tripId: owned.tripId, id: created.id };
}

// `formBase` (web edit form only) is what the form rendered: units the user
// did not change are left out of SET, so a background write to them (resync
// cron, purge) that happened while the form was open survives.
export async function updatePlace(
  userId: string,
  placeId: string,
  fields: PlaceFields,
  opts?: { googlePick?: GooglePick | null; formBase?: FormBase | null; now?: Date },
  exec: IdemExecutor = db,
): Promise<{ tripId: string }> {
  const owned = await resolvePlaceWrite(userId, placeId, exec);
  if (!fields.name) throw new ServiceError('bad_request', 'Name is required');

  const now = opts?.now ?? new Date();
  const base = opts?.formBase ?? null;
  const [stored]: StoredSync[] = await exec
    .select({
      rating: places.rating,
      reviews: places.reviews,
      hours: places.hours,
      ratingSyncedAt: places.ratingSyncedAt,
      hoursSyncedAt: places.hoursSyncedAt,
      placeIdExternal: places.placeIdExternal,
      googleSnapshot: places.googleSnapshot,
      googleSyncedAt: places.googleSyncedAt,
      googleStatus: places.googleStatus,
    })
    .from(places)
    .where(eq(places.id, placeId))
    .limit(1);
  if (!stored) throw new ServiceError('forbidden', 'Forbidden');

  await (exec as typeof db)
    .update(places)
    .set({
      ...omitUnits(fields, untouchedUnits(fields, base)),
      ...googleSyncOnUpdate(stored, fields, opts?.googlePick ?? null, now, base),
      updatedAt: now,
    })
    .where(eq(places.id, placeId));
  await touchTrip(owned.tripId, exec);
  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'update',
    entityType: 'place',
    entityId: placeId,
    after: { name: fields.name },
  });

  return { tripId: owned.tripId };
}

export async function updatePlaceNote(
  userId: string,
  placeId: string,
  note: string | null,
): Promise<{ tripId: string }> {
  const owned = await resolvePlaceWrite(userId, placeId);

  await db
    .update(places)
    .set({ note, updatedAt: new Date() })
    .where(eq(places.id, placeId));
  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'update',
    entityType: 'place',
    entityId: placeId,
    after: { note },
  });

  return { tripId: owned.tripId };
}

// Hard-delete the place, re-index survivors, and realign segments.
export async function removePlace(
  userId: string,
  placeId: string,
): Promise<{ tripId: string }> {
  const owned = await resolvePlaceWrite(userId, placeId);

  await db.delete(places).where(eq(places.id, placeId));

  await db
    .update(places)
    .set({ idx: sql`${places.idx} - 1` })
    .where(and(eq(places.dayId, owned.dayId), gt(places.idx, owned.idx)));

  // Drop the segment that originated from this place, then shift higher
  // segments down to stay aligned with the new place ordering.
  await db
    .delete(segments)
    .where(and(eq(segments.dayId, owned.dayId), eq(segments.idx, owned.idx)));
  await db
    .update(segments)
    .set({ idx: sql`${segments.idx} - 1` })
    .where(and(eq(segments.dayId, owned.dayId), gt(segments.idx, owned.idx)));

  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'remove',
    entityType: 'place',
    entityId: placeId,
  });

  return { tripId: owned.tripId };
}

// Reorder every place in a day to match `order` (a list of place ids).
// A no-op empty order returns null so the caller can skip revalidation.
export async function reorderPlaces(
  userId: string,
  dayId: string,
  order: string[],
): Promise<{ tripId: string } | null> {
  const owned = await resolveDayWrite(userId, dayId);
  if (order.length === 0) return null;

  // Two-phase write to dodge the unique (day_id, idx) collision while
  // shuffling — bump every place to a temporary high idx, then rewrite.
  const offset = 1_000_000;
  await db
    .update(places)
    .set({ idx: sql`${places.idx} + ${offset}` })
    .where(eq(places.dayId, dayId));

  for (let i = 0; i < order.length; i++) {
    await db
      .update(places)
      .set({ idx: i, updatedAt: new Date() })
      .where(and(eq(places.id, order[i]), eq(places.dayId, dayId)));
  }

  await touchTrip(owned.tripId);
  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'reorder',
    entityType: 'place',
    after: { dayId, order },
  });

  return { tripId: owned.tripId };
}
