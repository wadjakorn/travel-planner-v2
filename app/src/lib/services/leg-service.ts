// Leg (place-to-place travel) service, TP-0141 spec §1.4. Rows stay
// positional: segment idx k is the leg from live place k to k+1, and
// day.start_* is the leg into place 0. Only note/durationMin follow the
// (from, to) place pair across reorder/remove; mode stays with the position.
//
// Every writer here runs inside a postgres-js (`dbNode`) transaction that
// first locks the day row (`lockDay`). Positions are *live* positions — the
// index in `ORDER BY idx` of non-deleted places — never raw `places.idx`,
// which a stale partial reorder can park at ≥ 1 000 000.

import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { dbNode } from '@/db';
import { days, places, segments } from '@/db/schema';
import { touchTripAfterCommit } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
import type { IdemExecutor, NodeTx } from '@/lib/api/idempotency';
import {
  arriveForPlaces,
  dayStartView,
  legNotesByPair,
  realignLegNotes,
  type ArriveInput,
  type ArriveView,
  type LegNote,
} from '@/lib/legs';
import { ServiceError } from './service-error';
import { resolvePlaceWrite } from './access';

/**
 * The (non-tx) client a leg writer uses for post-commit statements such as
 * `touchTrip`. The tx itself never touches `trip`, so it cannot invert lock
 * order with `updateTrip` (trip → days). Same executor family as `txDb`, so
 * an injected test client keeps working.
 */
export function afterCommit(txDb: typeof dbNode): IdemExecutor {
  return txDb as unknown as IdemExecutor;
}

/** `SELECT … FROM day WHERE id = $1 FOR UPDATE`. Must be the first lock a leg writer takes. */
export async function lockDay(exec: IdemExecutor, dayId: string): Promise<void> {
  await exec.select({ id: days.id }).from(days).where(eq(days.id, dayId)).for('update');
}

/** Non-deleted place ids of a day in live order. */
export async function liveOrder(exec: IdemExecutor, dayId: string): Promise<string[]> {
  const rows = await exec
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.dayId, dayId), isNull(places.deletedAt)))
    .orderBy(asc(places.idx));
  return rows.map((r) => r.id);
}

async function readSegs(exec: IdemExecutor, dayId: string) {
  return exec
    .select({
      idx: segments.idx,
      mode: segments.mode,
      note: segments.note,
      durationMin: segments.durationMin,
    })
    .from(segments)
    .where(eq(segments.dayId, dayId))
    .orderBy(asc(segments.idx));
}

async function readDayStart(exec: IdemExecutor, dayId: string) {
  const [row] = await exec
    .select({
      startMode: days.startMode,
      startNote: days.startNote,
      startDurationMin: days.startDurationMin,
      defaultMode: days.defaultMode,
    })
    .from(days)
    .where(eq(days.id, dayId))
    .limit(1);
  if (!row) throw new ServiceError('not_found', 'Day not found');
  return row;
}

/**
 * Renumber the day's places to idx 0..n-1 in current idx order (TP-0150), so
 * raw idx = live position again after a stale partial reorder parked some at
 * ≥ 1 000 000. Caller's tx, day already locked. Two-phase (park the movers at
 * -(i+1), then flip) so the unique (day_id, idx) index never collides. Does not
 * touch updatedAt; a contiguous day gets no writes.
 *
 * All rows are renumbered, soft-deleted ones included: place_day_idx_unique
 * covers them too. Nothing soft-deletes places today; if something starts to,
 * a deleted row between live ones makes raw idx ≠ live position again (latent).
 */
export async function compactPlaces(tx: IdemExecutor, dayId: string): Promise<void> {
  const rows = await tx
    .select({ id: places.id, idx: places.idx })
    .from(places)
    .where(eq(places.dayId, dayId))
    .orderBy(asc(places.idx));
  const movers = rows.flatMap((r, i) => (r.idx === i ? [] : [{ id: r.id, i }]));
  if (movers.length === 0) return;
  for (const m of movers) {
    await tx
      .update(places)
      .set({ idx: -(m.i + 1) })
      .where(eq(places.id, m.id));
  }
  await tx
    .update(places)
    .set({ idx: sql`-${places.idx} - 1` })
    .where(and(eq(places.dayId, dayId), lt(places.idx, 0)));
}

/**
 * Make the day's segment rows exactly idx 0..n-2, n = live places (TP-0150,
 * REQUIREMENTS:57). Caller's tx, day locked, places already compacted. Extra
 * rows (idx ≥ n-1, e.g. the leg into a removed last place) are deleted; gaps
 * get a `day.default_mode ?? 'drive'` row. Surviving rows keep id, mode, note.
 * The fill uses ON CONFLICT DO NOTHING so a row a non-tx writer
 * (setSegmentMode, ensureSegmentForAppendedPlace) committed meanwhile wins.
 */
export async function syncLegRows(tx: IdemExecutor, dayId: string): Promise<void> {
  const n = (await liveOrder(tx, dayId)).length;
  await tx
    .delete(segments)
    .where(and(eq(segments.dayId, dayId), gte(segments.idx, Math.max(n - 1, 0))));
  if (n < 2) return;
  const have = new Set((await readSegs(tx, dayId)).map((s) => s.idx));
  const missing: number[] = [];
  for (let k = 0; k < n - 1; k++) if (!have.has(k)) missing.push(k);
  if (missing.length === 0) return;
  const { defaultMode } = await readDayStart(tx, dayId);
  await tx
    .insert(segments)
    .values(missing.map((idx) => ({ dayId, idx, mode: defaultMode ?? 'drive', distance: '', time: '' })))
    .onConflictDoNothing({ target: [segments.dayId, segments.idx] });
}

/** Restore the day invariant inside the caller's tx (day already locked):
 *  places.idx = 0..n-1 in current idx order; segment rows exactly idx 0..n-2
 *  (missing → insert mode = day.default_mode ?? 'drive', distance/time ''; extra → delete).
 *  Existing rows keep their mode/note/duration (positional, TP-0141 §1.4). */
export async function normalizeDayLegs(tx: IdemExecutor, dayId: string): Promise<void> {
  await compactPlaces(tx, dayId);
  await syncLegRows(tx, dayId);
}

/** Leg notes keyed by place pair, read before an order-changing write. */
export async function readLegSnapshot(
  exec: IdemExecutor,
  dayId: string,
): Promise<Map<string, LegNote>> {
  const order = await liveOrder(exec, dayId);
  const segs = await readSegs(exec, dayId);
  const d = await readDayStart(exec, dayId);
  return legNotesByPair(order, segs, { note: d.startNote, durationMin: d.startDurationMin });
}

const same = (a: LegNote, b: LegNote) => a.note === b.note && a.durationMin === b.durationMin;

/**
 * After an order-changing write: re-read the live order and segment idxs from
 * the DB and move note/durationMin to follow their pair. Never inserts or
 * deletes rows (callers run syncLegRows first); never touches mode / start_mode.
 */
export async function applyLegRealign(
  exec: IdemExecutor,
  dayId: string,
  before: Map<string, LegNote>,
): Promise<void> {
  const order = await liveOrder(exec, dayId);
  const segs = await readSegs(exec, dayId);
  const d = await readDayStart(exec, dayId);
  const next = realignLegNotes(
    before,
    order,
    segs.map((s) => s.idx),
  );

  for (const n of next.segments) {
    const cur = segs.find((s) => s.idx === n.idx);
    if (cur && same(cur, n)) continue;
    await exec
      .update(segments)
      .set({ note: n.note, durationMin: n.durationMin })
      .where(and(eq(segments.dayId, dayId), eq(segments.idx, n.idx)));
  }
  if (!same({ note: d.startNote, durationMin: d.startDurationMin }, next.start)) {
    await exec
      .update(days)
      .set({ startNote: next.start.note, startDurationMin: next.start.durationMin })
      .where(eq(days.id, dayId));
  }
}

/**
 * Write the leg arriving at live `position`. Position 0 is the day start leg
 * (`arrive` sets start_*, null clears all three). Position p ≥ 1 is segment
 * idx p-1: an object upserts; null clears note/durationMin but keeps the row
 * and its mode (a missing row stays missing).
 */
export async function writeArrive(
  exec: IdemExecutor,
  dayId: string,
  position: number,
  arrive: ArriveInput | null,
): Promise<void> {
  if (position < 0) throw new ServiceError('not_found', 'Place not found');
  if (position === 0) {
    await exec
      .update(days)
      .set(
        arrive
          ? { startMode: arrive.mode, startDurationMin: arrive.durationMin, startNote: arrive.note }
          : { startMode: null, startDurationMin: null, startNote: null },
      )
      .where(eq(days.id, dayId));
    return;
  }
  const idx = position - 1;
  const [existing] = await exec
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.dayId, dayId), eq(segments.idx, idx)))
    .limit(1);
  if (!arrive) {
    if (!existing) return;
    await exec
      .update(segments)
      .set({ note: null, durationMin: null })
      .where(eq(segments.id, existing.id));
    return;
  }
  if (existing) {
    await exec
      .update(segments)
      .set({ mode: arrive.mode, note: arrive.note, durationMin: arrive.durationMin })
      .where(eq(segments.id, existing.id));
    return;
  }
  await exec.insert(segments).values({
    dayId,
    idx,
    mode: arrive.mode,
    distance: '',
    time: '',
    note: arrive.note,
    durationMin: arrive.durationMin,
  });
}

async function placeDay(exec: IdemExecutor, placeId: string): Promise<string> {
  const [row] = await exec
    .select({ dayId: places.dayId })
    .from(places)
    .where(and(eq(places.id, placeId), isNull(places.deletedAt)))
    .limit(1);
  if (!row) throw new ServiceError('not_found', 'Place not found');
  return row.dayId;
}

/** Lock the place's day, then write its arrive leg at its live position. No authz. */
export async function applyPlaceArrive(
  tx: NodeTx,
  placeId: string,
  arrive: ArriveInput | null,
): Promise<void> {
  const dayId = await placeDay(tx, placeId);
  await lockDay(tx, dayId);
  const position = (await liveOrder(tx, dayId)).indexOf(placeId);
  await writeArrive(tx, dayId, position, arrive);
}

/** The arrive leg of a place at its live position (null when none). */
export async function readArriveView(
  exec: IdemExecutor,
  placeId: string,
): Promise<ArriveView | null> {
  const dayId = await placeDay(exec, placeId);
  const order = await liveOrder(exec, dayId);
  const position = order.indexOf(placeId);
  if (position < 0) return null;
  const d = await readDayStart(exec, dayId);
  const segs = await readSegs(exec, dayId);
  return arriveForPlaces(order.length, segs, dayStartView(d))[position] ?? null;
}

/** Authorized set/clear of a place's arrive leg in one dbNode transaction. */
export async function setPlaceArrive(
  userId: string,
  placeId: string,
  arrive: ArriveInput | null,
  txDb: typeof dbNode = dbNode,
): Promise<{ tripId: string; arrive: ArriveView | null }> {
  const result = await txDb.transaction(async (tx) => {
    const owned = await resolvePlaceWrite(userId, placeId, tx);
    await applyPlaceArrive(tx, placeId, arrive);
    return { tripId: owned.tripId, arrive: await readArriveView(tx, placeId) };
  });
  await touchTripAfterCommit(result.tripId, afterCommit(txDb));
  await writeAudit({
    tripId: result.tripId,
    userId,
    action: 'update',
    entityType: 'place',
    entityId: placeId,
    after: { arrive },
  });
  return result;
}
