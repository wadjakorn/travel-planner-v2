// Applies PUT /trips/:tripId/plan ops inside the caller's write tx, after
// lockAndCheck (TP-0146, design v3 §7). Order matters: park → move/reorder →
// insert → delete → field merges → legs → body arrives.

import 'server-only';
import { eq, inArray, sql } from 'drizzle-orm';
import { days, places } from '@/db/schema';
import type { NodeTx } from '@/lib/api/idempotency';
import type { LegNote } from '@/lib/legs';
import { googleSyncOnAdd } from '@/lib/places/google-sync';
import { applyLegRealign, applyPlaceArrive, normalizeDayLegs, readLegSnapshot } from './leg-service';
import { placeFieldsFromRow, updatePlace } from './place-service';
import type { PlanOps } from './plan-diff';

export async function applyPlanOps(
  tx: NodeTx,
  userId: string,
  ops: PlanOps,
  now: Date = new Date(),
): Promise<{ createdIds: Map<number, string> }> {
  const touched = [...ops.finalOrder.keys()];

  // Leg notes keyed by place pair, merged across every touched day (M3): a
  // pair moving together to another day keeps its note.
  const legNotes = new Map<string, LegNote>();
  for (const dayId of touched) for (const [k, v] of await readLegSnapshot(tx, dayId)) legNotes.set(k, v);

  for (const u of ops.dayUpdates) await tx.update(days).set(u.set).where(eq(days.id, u.id));

  // Park every place of every touched day at -(idx+1): collision-free (M4).
  if (touched.length) {
    await tx.update(places).set({ idx: sql`-(${places.idx}) - 1` }).where(inArray(places.dayId, touched));
  }

  const createdIds = new Map<number, string>();
  const createdById = new Map(ops.creates.map((c) => [c.ref, c]));
  for (const [dayId, order] of ops.finalOrder) {
    for (let idx = 0; idx < order.length; idx++) {
      const r = order[idx];
      if ('existing' in r) {
        // One UPDATE sets day and idx together (N7).
        await tx.update(places).set({ dayId, idx, updatedAt: now }).where(eq(places.id, r.existing));
      } else {
        const c = createdById.get(r.created)!;
        const [row] = await tx
          .insert(places)
          .values({ ...c.fields, ...googleSyncOnAdd(c.fields, null, now), dayId, idx })
          .returning({ id: places.id });
        createdIds.set(r.created, row.id);
      }
    }
  }

  if (ops.deletes.length) await tx.delete(places).where(inArray(places.id, ops.deletes));

  // Field merges onto the row re-read in this tx: a field another writer set
  // meanwhile survives unless the body names it.
  for (const u of ops.updates) {
    const [fresh] = await tx.select().from(places).where(eq(places.id, u.id)).limit(1);
    await updatePlace(userId, u.id, { ...placeFieldsFromRow(fresh), ...u.patch }, { deferTouch: true, audit: false, now }, tx);
  }

  for (const dayId of touched) {
    await normalizeDayLegs(tx, dayId);
    await applyLegRealign(tx, dayId, legNotes);
  }

  for (const a of ops.arrives) {
    const id = 'existing' in a.ref ? a.ref.existing : createdIds.get(a.ref.created)!;
    await applyPlaceArrive(tx, id, a.arrive);
  }
  return { createdIds };
}
