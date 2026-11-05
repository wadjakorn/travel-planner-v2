// Snapshot + structural fingerprint for PUT /trips/:tripId/plan (TP-0146,
// design v3 §3.3). trip.updatedAt is not an atomic version (leg/place writers
// bump it after commit), so the write tx re-reads this fingerprint under the
// trip + all-days locks and refuses (409) when anything moved meanwhile.

import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { dbNode } from '@/db';
import { days, places, segments, trips } from '@/db/schema';
import type { NodeTx } from '@/lib/api/idempotency';
import { ServiceError } from './service-error';
import { requireTripAccess } from './access';

export type PlaceRow = typeof places.$inferSelect;
type DayRow = Pick<
  typeof days.$inferSelect,
  'id' | 'idx' | 'title' | 'defaultMode' | 'startMode' | 'startNote' | 'startDurationMin'
>;
type SegRow = Pick<typeof segments.$inferSelect, 'dayId' | 'idx' | 'mode' | 'note' | 'durationMin'>;

export type PlanSnapshot = {
  tripId: string;
  updatedAt: Date;
  days: DayRow[]; // by idx
  placesByDay: Map<string, PlaceRow[]>; // live order
  segments: SegRow[];
  fingerprint: string;
};

const DAY_COLS = {
  id: days.id,
  idx: days.idx,
  title: days.title,
  defaultMode: days.defaultMode,
  startMode: days.startMode,
  startNote: days.startNote,
  startDurationMin: days.startDurationMin,
};
const SEG_COLS = {
  dayId: segments.dayId,
  idx: segments.idx,
  mode: segments.mode,
  note: segments.note,
  durationMin: segments.durationMin,
};

/** Pure: day id:idx + fields, place id:dayId:idx, segment rows. Day idx must be 0..n-1. */
export function planFingerprint(
  dayRows: DayRow[],
  placeRows: Pick<PlaceRow, 'id' | 'dayId' | 'idx'>[],
  segRows: SegRow[],
): string {
  const d = [...dayRows]
    .sort((a, b) => a.idx - b.idx)
    .map((x) => [x.id, x.idx, x.title, x.defaultMode, x.startMode, x.startNote, x.startDurationMin].join(':'));
  const p = placeRows
    .map((x) => `${x.dayId}:${String(x.idx).padStart(8, '0')}:${x.id}`)
    .sort();
  const s = segRows.map((x) => [x.dayId, String(x.idx).padStart(6, '0'), x.mode, x.note, x.durationMin].join(':')).sort();
  return JSON.stringify([d, p, s]);
}

export function daysContiguous(dayRows: { idx: number }[]): boolean {
  return [...dayRows].sort((a, b) => a.idx - b.idx).every((d, i) => d.idx === i);
}

async function readRows(tx: NodeTx, tripId: string) {
  const dayRows = await tx.select(DAY_COLS).from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.idx));
  const ids = dayRows.map((d) => d.id);
  const placeRows = ids.length
    ? await tx
        .select()
        .from(places)
        .where(and(inArray(places.dayId, ids), isNull(places.deletedAt)))
        .orderBy(asc(places.dayId), asc(places.idx))
    : [];
  const segRows = ids.length ? await tx.select(SEG_COLS).from(segments).where(inArray(segments.dayId, ids)) : [];
  return { dayRows, placeRows, segRows };
}

/** One consistent read (REPEATABLE READ, read only) of everything PUT /plan diffs against. */
export async function readPlanSnapshot(
  userId: string,
  tripId: string,
  txDb: typeof dbNode = dbNode,
): Promise<PlanSnapshot> {
  return txDb.transaction(
    async (tx) => {
      await requireTripAccess(userId, tripId, 'write', tx);
      const [trip] = await tx
        .select({ updatedAt: trips.updatedAt })
        .from(trips)
        .where(and(eq(trips.id, tripId), isNull(trips.deletedAt)))
        .limit(1);
      if (!trip) throw new ServiceError('not_found', 'Trip not found');
      const { dayRows, placeRows, segRows } = await readRows(tx as NodeTx, tripId);
      const placesByDay = new Map<string, PlaceRow[]>(dayRows.map((d) => [d.id, []]));
      for (const p of placeRows) placesByDay.get(p.dayId)?.push(p);
      return {
        tripId,
        updatedAt: trip.updatedAt,
        days: dayRows,
        placesByDay,
        segments: segRows,
        fingerprint: planFingerprint(dayRows, placeRows, segRows),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

/**
 * Inside the write tx: lock the trip (NO KEY UPDATE: child inserts still pass
 * their FK check) and every day ORDER BY idx (serialises with single-day
 * writers), then re-read the fingerprint. 409 unless it equals the snapshot's
 * and the days are 0..n-1.
 */
export async function lockAndCheck(tx: NodeTx, snap: PlanSnapshot): Promise<void> {
  const locked = await tx.execute(
    sql`SELECT id FROM trip WHERE id = ${snap.tripId} AND deleted_at IS NULL FOR NO KEY UPDATE`,
  );
  if ((locked as unknown as unknown[]).length === 0) throw new ServiceError('not_found', 'Trip not found');
  await tx.execute(sql`SELECT id FROM day WHERE trip_id = ${snap.tripId} ORDER BY idx FOR UPDATE`);
  const { dayRows, placeRows, segRows } = await readRows(tx, snap.tripId);
  if (!daysContiguous(dayRows) || planFingerprint(dayRows, placeRows, segRows) !== snap.fingerprint) {
    throw new ServiceError('conflict', 'The trip changed while this plan was being applied; GET it again and retry', {
      reason: 'plan_changed',
    });
  }
}
