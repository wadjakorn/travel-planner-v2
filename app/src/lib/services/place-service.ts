// Place mutation service. Framework-agnostic — see trip-service.ts.
// FormData parsing stays in the action layer; these take typed fields.

import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { db, dbNode } from '@/db';
import { places, segments } from '@/db/schema';
import { touchTrip, touchTripAfterCommit } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
import type { IdemExecutor, NodeTx } from '@/lib/api/idempotency';
import { ServiceError } from './service-error';
import {
  afterCommit,
  applyLegRealign,
  applyPlaceArrive,
  compactPlaces,
  lockDay,
  readArriveView,
  readLegSnapshot,
  syncLegRows,
} from './leg-service';
import type { ArriveInput } from '@/lib/legs';
import { resolveDayWrite, resolvePlaceWrite, type SegmentMode } from './access';
import {
  apiPlaceView,
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
  // Planning status (default 'confirmed'). Written on create +
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
export async function ensureSegmentForAppendedPlace(
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
  // A reorder/remove (TP-0150) may fill this row between the SELECT and here.
  await exec
    .insert(segments)
    .values({
      dayId,
      idx: prevIdx,
      mode: defaultMode ?? 'drive',
      distance: '',
      time: '',
    })
    .onConflictDoNothing({ target: [segments.dayId, segments.idx] });
}

// Append a place at the end of a day.
//
// With `opts.arrive` (TP-0141) the leg into the new place is written in the
// same transaction, so `exec` must be a dbNode tx (the POST route's
// withIdempotencyAtomic tx). The day row is locked before anything is read or
// inserted, so concurrent adds on one day serialize. `touchTrip` is then NOT
// run here: the caller runs it after commit (the tx never locks `trip`, so it
// cannot invert lock order with updateTrip's trip -> days).
export async function addPlace(
  userId: string,
  dayId: string,
  fields: PlaceFields,
  exec: IdemExecutor = db,
  opts?: { googlePick?: GooglePick | null; now?: Date; arrive?: ArriveInput | null },
): Promise<{ tripId: string; id: string }> {
  const arrive = opts?.arrive ?? null;
  if (arrive && exec === db) {
    throw new ServiceError('internal', 'addPlace with arrive must run in a dbNode transaction');
  }
  const owned = await resolveDayWrite(userId, dayId, exec);
  if (!fields.name) throw new ServiceError('bad_request', 'Name is required');
  if (arrive) await lockDay(exec, dayId);

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
  if (arrive) await applyPlaceArrive(exec as NodeTx, created.id, arrive);
  else await touchTrip(owned.tripId, exec);
  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'add',
    entityType: 'place',
    entityId: created.id,
    after: arrive ? { name: fields.name, kind: fields.kind, arrive } : { name: fields.name, kind: fields.kind },
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
  // `deferTouch`: skip the in-tx touchTrip; the caller runs it after commit
  // (PATCH /places/:id, whose tx may also lock the day for `arrive`).
  // `audit: false`: the caller writes one summary row (PUT /trips/:id/plan).
  opts?: { googlePick?: GooglePick | null; formBase?: FormBase | null; now?: Date; deferTouch?: boolean; audit?: boolean },
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
  if (!opts?.deferTouch) await touchTrip(owned.tripId, exec);
  if (opts?.audit !== false) {
    await writeAudit({
      tripId: owned.tripId,
      userId,
      action: 'update',
      entityType: 'place',
      entityId: placeId,
      after: { name: fields.name },
    });
  }

  return { tripId: owned.tripId };
}

/**
 * PATCH /api/v1/places/:id after parsing + link resolution: merge `patch` onto
 * the place (see the merge note below) and, when `arrive` is not undefined,
 * write its arrive leg in the same
 * dbNode tx (day lock first: day -> place rows, as reorder/remove). Returns
 * the API place view with `arrive`. Post-commit: best-effort touchTrip, and an
 * `{ arrive }` audit row when the leg was written.
 */
type PlaceRow = typeof places.$inferSelect;

// The PlaceFields view of a stored row (PATCH merge base, TP-0145).
export function placeFieldsFromRow(row: PlaceRow): PlaceFields {
  return {
    kind: row.kind as PlaceKind,
    status: row.status as PlaceStatus,
    sourceUrl: row.sourceUrl,
    name: row.name,
    category: row.category,
    rating: row.rating,
    reviews: row.reviews,
    time: row.time,
    duration: row.duration,
    price: row.price,
    address: row.address,
    phone: row.phone,
    website: row.website,
    hours: row.hours,
    tags: row.tags,
    thumb: row.thumb,
    note: row.note,
    lat: row.lat,
    lng: row.lng,
    placeIdExternal: row.placeIdExternal,
  };
}

// Current fields of a place the user may write (PATCH resolves the location
// against these before its tx).
export async function readPlaceFields(
  userId: string,
  placeId: string,
  exec: IdemExecutor = db,
): Promise<PlaceFields> {
  await resolvePlaceWrite(userId, placeId, exec);
  const [row] = await (exec as typeof db).select().from(places).where(eq(places.id, placeId)).limit(1);
  if (!row) throw new ServiceError('not_found', 'Place not found');
  return placeFieldsFromRow(row);
}

// PATCH /places/:id (TP-0145 merge-patch): `patch` holds only the fields the
// caller sent (plus any resolved location). It is merged onto the row re-read
// inside the tx, so a field edited meanwhile survives unless it is in `patch`.
// An empty patch writes nothing (arrive may still apply).
export async function patchPlace(
  userId: string,
  placeId: string,
  patch: Partial<PlaceFields>,
  arrive: ArriveInput | null | undefined,
  txDb: typeof dbNode = dbNode,
) {
  const out = await txDb.transaction(async (tx) => {
    const owned = await resolvePlaceWrite(userId, placeId, tx);
    if (arrive !== undefined) await lockDay(tx, owned.dayId);
    let tripId = owned.tripId;
    const wrote = Object.keys(patch).length > 0 || arrive !== undefined;
    if (Object.keys(patch).length > 0) {
      const [fresh] = await tx.select().from(places).where(eq(places.id, placeId)).for('update').limit(1);
      if (!fresh) throw new ServiceError('not_found', 'Place not found');
      const fields = { ...placeFieldsFromRow(fresh), ...patch };
      ({ tripId } = await updatePlace(userId, placeId, fields, { deferTouch: true }, tx));
    }
    if (arrive !== undefined) await applyPlaceArrive(tx, placeId, arrive);
    const [place] = await tx.select().from(places).where(eq(places.id, placeId)).limit(1);
    return {
      tripId,
      wrote,
      place: place
        ? { ...apiPlaceView(place, new Date()), arrive: await readArriveView(tx, placeId) }
        : undefined,
    };
  });
  if (out.wrote) await touchTripAfterCommit(out.tripId, afterCommit(txDb));
  if (arrive !== undefined) {
    await writeAudit({
      tripId: out.tripId,
      userId,
      action: 'update',
      entityType: 'place',
      entityId: placeId,
      after: { arrive },
    });
  }
  return out;
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

// Hard-delete the place, re-index survivors, and realign segments. Runs in a
// dbNode tx that locks the day first; leg notes then follow their place pair
// (TP-0141 §1.4) while rows and modes stay positional.
export async function removePlace(
  userId: string,
  placeId: string,
  txDb: typeof dbNode = dbNode,
): Promise<{ tripId: string }> {
  const owned = await txDb.transaction(async (tx) => {
    const owned = await resolvePlaceWrite(userId, placeId, tx);
    await lockDay(tx, owned.dayId);
    // Positional data is read only after the lock (spec §1.4): a reorder that
    // committed between authz and the lock has moved this place's idx.
    const before = await readLegSnapshot(tx, owned.dayId);
    // TP-0150: compact first so the raw-idx delete/shift below acts on the
    // live position (a stale partial reorder may have parked places ≥ 1e6).
    await compactPlaces(tx, owned.dayId);
    const [cur] = await tx
      .select({ idx: places.idx })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.dayId, owned.dayId)))
      .limit(1);
    if (!cur) throw new ServiceError('not_found', 'Place not found');
    const idx = cur.idx;

    await tx.delete(places).where(eq(places.id, placeId));

    // Two-phase shift: Postgres checks the unique (day_id, idx) index row by row, so a
    // single `idx - 1` UPDATE collides depending on physical row order. Park the
    // survivors at negative idx first, then flip them back one lower.
    await tx
      .update(places)
      .set({ idx: sql`-${places.idx}` })
      .where(and(eq(places.dayId, owned.dayId), gt(places.idx, idx)));
    await tx
      .update(places)
      .set({ idx: sql`-${places.idx} - 1` })
      .where(and(eq(places.dayId, owned.dayId), lt(places.idx, 0)));

    // Drop the segment that originated from this place, then shift higher
    // segments down to stay aligned with the new place ordering.
    await tx
      .delete(segments)
      .where(and(eq(segments.dayId, owned.dayId), eq(segments.idx, idx)));
    await tx
      .update(segments)
      .set({ idx: sql`-${segments.idx}` })
      .where(and(eq(segments.dayId, owned.dayId), gt(segments.idx, idx)));
    await tx
      .update(segments)
      .set({ idx: sql`-${segments.idx} - 1` })
      .where(and(eq(segments.dayId, owned.dayId), lt(segments.idx, 0)));

    // TP-0150: rows = places − 1 (drops the orphan leg into a removed last place).
    await syncLegRows(tx, owned.dayId);
    await applyLegRealign(tx, owned.dayId, before);
    return owned;
  });
  // After commit, so the tx locks only day/places/segments (never trip →
  // no lock-order inversion with updateTrip's trip → days).
  await touchTripAfterCommit(owned.tripId, afterCommit(txDb));

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
// Runs in a dbNode tx that locks the day first. The resulting order is read
// back from the DB (a stale tab may send an incomplete list), and leg notes
// follow their place pair while rows and modes stay positional (TP-0141 §1.4).
// Afterwards places are contiguous and rows = places − 1 (TP-0150).
export async function reorderPlaces(
  userId: string,
  dayId: string,
  order: string[],
  txDb: typeof dbNode = dbNode,
): Promise<{ tripId: string } | null> {
  const owned = await txDb.transaction(async (tx) => {
    const owned = await resolveDayWrite(userId, dayId, tx);
    if (order.length === 0) return null;
    await lockDay(tx, dayId);
    const before = await readLegSnapshot(tx, dayId);

    // Two-phase write to dodge the unique (day_id, idx) collision while
    // shuffling — bump every place to a temporary high idx, then rewrite.
    const offset = 1_000_000;
    await tx
      .update(places)
      .set({ idx: sql`${places.idx} + ${offset}` })
      .where(eq(places.dayId, dayId));

    for (let i = 0; i < order.length; i++) {
      await tx
        .update(places)
        .set({ idx: i, updatedAt: new Date() })
        .where(and(eq(places.id, order[i]), eq(places.dayId, dayId)));
    }

    // TP-0150: places left out of a partial `order` stay parked ≥ 1e6; make
    // them contiguous and restore rows = places − 1 before notes realign.
    await compactPlaces(tx, dayId);
    await syncLegRows(tx, dayId);
    await applyLegRealign(tx, dayId, before);
    return owned;
  });
  if (!owned) return null;
  await touchTripAfterCommit(owned.tripId, afterCommit(txDb));

  await writeAudit({
    tripId: owned.tripId,
    userId,
    action: 'reorder',
    entityType: 'place',
    after: { dayId, order },
  });

  return { tripId: owned.tripId };
}
