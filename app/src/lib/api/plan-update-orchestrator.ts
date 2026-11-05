// PUT /trips/:tripId/plan (TP-0146, design v3). Parse → snapshot (RR) →
// version + id checks → resolve links (outside any tx) → diff → dryRun, or a
// write tx that locks the trip and every day, re-checks the fingerprint and
// applies the ops. Idempotent like import: the marker is written in the tx.

import 'server-only';
import { NextResponse } from 'next/server';
import { db, dbNode } from '@/db';
import { claimKey, persistCompletion, releaseClaim, type IdemExecutor, type NodeTx } from '@/lib/api/idempotency';
import { parsePlanUpdate } from '@/lib/api/plan-update-input';
import { applyPlaceLink, LinkBudget, type PlaceLinkDeps } from '@/lib/api/place-link';
import { resolvePlacePatch } from '@/lib/api/place-patch';
import { transitAsPlaceWarning } from '@/lib/api/leg-warnings';
import {
  finalizeImportWarnings,
  summarizeWarnings,
  type ImportWarning,
} from '@/lib/api/import-warnings';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import { ServiceError } from '@/lib/services/service-error';
import { placeFieldsFromRow } from '@/lib/services/place-service';
import { lockAndCheck, readPlanSnapshot, type PlanSnapshot } from '@/lib/services/plan-snapshot';
import { computePlanDiff, validatePlanAgainst, type PlanDiff } from '@/lib/services/plan-diff';
import { applyPlanOps } from '@/lib/services/plan-update';
import { touchTrip } from '@/lib/touch-trip';
import { writeAudit } from '@/lib/audit';
import { loadApiTrip } from '@/lib/trip-queries';
import type { ArriveInput } from '@/lib/legs';

export type PlanDeps = {
  loadApiTrip: typeof loadApiTrip;
  idemDb: IdemExecutor;
  txDb: typeof dbNode;
  link?: PlaceLinkDeps;
};
const defaultDeps: PlanDeps = { loadApiTrip, idemDb: db, txDb: dbNode };

type Marker = { __planIdem: true; tripId: string; diff: PlanDiff; warnings: ImportWarning[] };
const isMarker = (j: unknown): j is Marker =>
  typeof j === 'object' && j !== null && (j as { __planIdem?: unknown }).__planIdem === true;

// Deadlock / serialization / unique-index races map to a retryable 409.
const RETRYABLE = new Set(['40P01', '40001', '23505']);
function pgCode(e: unknown): string | null {
  for (let x: unknown = e; x && typeof x === 'object'; x = (x as { cause?: unknown }).cause) {
    const c = (x as { code?: unknown }).code;
    if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c)) return c;
  }
  return null;
}

/** The leg arriving at a place in the snapshot (start leg for position 0). */
function arriveOf(snap: PlanSnapshot) {
  const at = new Map<string, ArriveInput | null>();
  for (const d of snap.days) {
    (snap.placesByDay.get(d.id) ?? []).forEach((p, pos) => {
      if (pos === 0) {
        at.set(p.id, d.startMode ? { mode: d.startMode, durationMin: d.startDurationMin, note: d.startNote } : null);
      } else {
        const s = snap.segments.find((x) => x.dayId === d.id && x.idx === pos - 1);
        at.set(p.id, s ? { mode: s.mode, durationMin: s.durationMin, note: s.note } : null);
      }
    });
  }
  return (id: string) => at.get(id) ?? null;
}

export async function putTripPlan(
  userId: string,
  tripId: string,
  req: Request,
  body: Record<string, unknown>,
  deps: PlanDeps = defaultDeps,
): Promise<NextResponse> {
  const parsed = parsePlanUpdate(body);
  const snap = await readPlanSnapshot(userId, tripId, deps.txDb); // authz (write) before any replay

  // Claim before the version check: a retry of a committed PUT must replay
  // its stored result, not 409 on the updatedAt its own commit bumped.
  let owned: { key: string; id: string } | null = null;
  if (!parsed.dryRun) {
    const outcome = await claimKey(userId, req, body, deps.idemDb, { allowTakeover: true });
    if (outcome.kind === 'conflict') return outcome.response;
    if (outcome.kind === 'replay') {
      const j = outcome.responseJson;
      if (isMarker(j)) {
        const trip = await deps.loadApiTrip(j.tripId);
        return NextResponse.json(
          { trip, diff: j.diff, warnings: j.warnings, summary: summarizeWarnings(j.warnings) },
          { status: outcome.statusCode },
        );
      }
      return NextResponse.json(j, { status: outcome.statusCode });
    }
    if (outcome.kind === 'owned') owned = { key: outcome.key, id: outcome.id };
  }

  let committed = false;
  let diff: PlanDiff;
  let warnings: ImportWarning[];
  try {
    if (parsed.ifUpdatedAt && parsed.ifUpdatedAt.getTime() !== snap.updatedAt.getTime()) {
      throw new ServiceError('conflict', 'The trip changed since your GET (ifUpdatedAt does not match)', {
        reason: 'version_mismatch',
        details: { updatedAt: snap.updatedAt.toISOString() },
      });
    }
    validatePlanAgainst(snap, parsed);

    // Link resolution, outside any tx. Created places resolve like import;
    // updated ones only on new location input (resolvePlacePatch, TP-0145).
    const budget = new LinkBudget(userId);
    const raw: ImportWarning[] = [];
    const rows = new Map([...snap.placesByDay.values()].flat().map((p) => [p.id, p]));
    for (const d of parsed.days) {
      for (const p of d.places ?? []) {
        if (p.kind === 'new') {
          const r = await applyPlaceLink(p.fields, p.link, budget, deps.link, { query: p.query, near: p.near });
          p.fields = r.fields;
          for (const w of r.warnings) raw.push({ ...w, path: p.path, name: r.fields.name });
          const t = transitAsPlaceWarning(r.fields, p.link, p.path);
          if (t) raw.push(t);
        } else if (Object.keys(p.patch).length || p.link !== null) {
          const r = await resolvePlacePatch(placeFieldsFromRow(rows.get(p.id)!), p.patch, p.link, budget, deps.link);
          p.patch = r.patch;
          for (const w of r.warnings) raw.push({ ...w, path: p.path, name: r.merged.name });
          const t = transitAsPlaceWarning(r.merged, p.link, p.path);
          if (t) raw.push(t);
        }
      }
    }
    warnings = finalizeImportWarnings(raw, { days: [] } as unknown as ParsedImportPlan);
    const computed = computePlanDiff(snap, parsed, arriveOf(snap));
    diff = computed.diff;

    if (parsed.dryRun) {
      return NextResponse.json({ trip: null, diff, warnings, summary: summarizeWarnings(warnings) }, { status: 200 });
    }

    const marker: Marker = { __planIdem: true, tripId, diff, warnings };
    await deps.txDb.transaction(async (tx) => {
      await lockAndCheck(tx as NodeTx, snap);
      await applyPlanOps(tx as NodeTx, userId, computed.ops);
      await touchTrip(tripId, tx);
      if (owned) {
        const n = await persistCompletion(tx, userId, owned.key, owned.id, 200, marker);
        if (n === 0) throw new Error('idempotency claim was taken over mid-update; rolling back');
      }
    });
    committed = true;
  } catch (err) {
    if (owned && !committed) await releaseClaim(userId, owned.key, owned.id, deps.idemDb);
    const code = pgCode(err);
    if (code && RETRYABLE.has(code)) {
      throw new ServiceError('conflict', 'The trip is being edited concurrently; GET it again and retry', {
        reason: 'plan_changed',
      });
    }
    throw err;
  }
  const summary = summarizeWarnings(warnings);

  await writeAudit({
    tripId,
    userId,
    action: 'update',
    entityType: 'trip',
    after: {
      plan: {
        created: diff.places.created.length,
        updated: diff.places.updated.length,
        moved: diff.places.moved.length,
        deleted: diff.places.deleted.length,
        days: diff.days.updated.length,
        legs: diff.legs.updated.length,
      },
    },
  });
  const trip = await deps.loadApiTrip(tripId);
  return NextResponse.json({ trip, diff, warnings, summary }, { status: 200 });
}
