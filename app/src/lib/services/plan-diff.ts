// Pure diff for PUT /trips/:tripId/plan (TP-0146, design v3 §3.1, §4, §7).
// Input: the snapshot + the parsed (and link-resolved) body. Output: the ops
// plan-update applies and the diff the agent reviews. No DB.

import type { PlaceFields } from './place-service';
import type { ArriveInput } from '@/lib/legs';
import { bad, type ParsedPlanUpdate } from '@/lib/api/plan-update-input';
import type { PlanSnapshot, PlaceRow } from './plan-snapshot';

/** 400 unless `days` is exactly the stored day ids in order and every place id belongs to the trip. */
export function validatePlanAgainst(snap: PlanSnapshot, parsed: ParsedPlanUpdate): void {
  const stored = snap.days.map((d) => d.id);
  const sent = parsed.days.map((d) => d.id);
  if (stored.length !== sent.length || stored.some((id, i) => id !== sent[i])) {
    throw bad(
      '"days" must list every existing day id in its current order (reordering, removing or adding days is not supported here)',
      'day_order_unsupported',
      { expected: stored },
    );
  }
  const known = new Set<string>();
  for (const list of snap.placesByDay.values()) for (const p of list) known.add(p.id);
  for (const d of parsed.days) {
    for (const p of d.places ?? []) {
      if (p.kind === 'existing' && !known.has(p.id)) {
        throw bad(`${p.path}: place ${p.id} is not a place of this trip`, 'unknown_id', { path: p.path });
      }
    }
  }
}

/** Indices (into `seq`) of the LIS; among the longest, the one keeping the smallest values (earliest old positions). */
export function lisKeep(seq: number[]): Set<number> {
  const n = seq.length;
  // best[i] = the chosen increasing run ending at i, as indices.
  const best: number[][] = [];
  const better = (a: number[], b: number[]) => {
    if (a.length !== b.length) return a.length > b.length;
    for (let k = 0; k < a.length; k++) if (seq[a[k]] !== seq[b[k]]) return seq[a[k]] < seq[b[k]];
    return false;
  };
  let top: number[] = [];
  for (let i = 0; i < n; i++) {
    let cand: number[] = [i];
    for (let j = 0; j < i; j++) {
      if (seq[j] < seq[i]) {
        const c = [...best[j], i];
        if (better(c, cand)) cand = c;
      }
    }
    best[i] = cand;
    if (better(cand, top)) top = cand;
  }
  return new Set(top);
}

type Ref = { existing: string } | { created: number };
export type PlanOps = {
  dayUpdates: { id: string; set: { title?: string; defaultMode?: 'drive' | 'walk' | 'transit' | null } }[];
  /** Days whose place list changes, with their final order. */
  finalOrder: Map<string, Ref[]>;
  creates: { ref: number; dayId: string; fields: PlaceFields; path: string }[];
  deletes: string[];
  updates: { id: string; patch: Partial<PlaceFields> }[];
  arrives: { ref: Ref; arrive: ArriveInput | null; path: string }[];
};

export type PlanDiff = {
  days: { updated: { id: string; fields: string[] }[] };
  places: {
    created: { path: string; name: string }[];
    updated: { id: string; fields: string[] }[];
    moved: { id: string; fromDay: string; from: number; toDay: string; to: number }[];
    deleted: { id: string; name: string }[];
  };
  legs: { updated: { path: string; fields: string[] }[] };
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Keys of `patch` whose value differs from the stored row. */
export function changedFields(row: PlaceRow, patch: Partial<PlaceFields>): string[] {
  return Object.keys(patch).filter((k) => !same((row as Record<string, unknown>)[k], (patch as Record<string, unknown>)[k]));
}

export function computePlanDiff(
  snap: PlanSnapshot,
  parsed: ParsedPlanUpdate,
  currentArrive: (placeId: string) => ArriveInput | null,
): { ops: PlanOps; diff: PlanDiff } {
  const ops: PlanOps = { dayUpdates: [], finalOrder: new Map(), creates: [], deletes: [], updates: [], arrives: [] };
  const diff: PlanDiff = {
    days: { updated: [] },
    places: { created: [], updated: [], moved: [], deleted: [] },
    legs: { updated: [] },
  };

  const rowById = new Map<string, PlaceRow>();
  const oldPos = new Map<string, { dayId: string; pos: number }>();
  for (const [dayId, list] of snap.placesByDay) {
    list.forEach((p, pos) => {
      rowById.set(p.id, p);
      oldPos.set(p.id, { dayId, pos });
    });
  }
  // Where each listed existing place ends up.
  const listedIn = new Map<string, string>();
  for (const d of parsed.days) for (const p of d.places ?? []) if (p.kind === 'existing') listedIn.set(p.id, d.id);

  // Day fields.
  for (const d of parsed.days) {
    const row = snap.days.find((x) => x.id === d.id)!;
    const set: PlanOps['dayUpdates'][number]['set'] = {};
    const fields: string[] = [];
    if (d.title !== undefined && d.title !== row.title) {
      set.title = d.title;
      fields.push('title');
    }
    if (d.defaultMode !== undefined && d.defaultMode !== row.defaultMode) {
      set.defaultMode = d.defaultMode;
      fields.push('defaultMode');
    }
    if (fields.length) {
      ops.dayUpdates.push({ id: d.id, set });
      diff.days.updated.push({ id: d.id, fields });
    }
  }

  // Final order per day.
  let nextRef = 0;
  for (const d of parsed.days) {
    const old = (snap.placesByDay.get(d.id) ?? []).map((p) => p.id);
    const order: Ref[] = [];
    if (d.places) {
      for (const p of d.places) {
        if (p.kind === 'existing') order.push({ existing: p.id });
        else {
          const ref = nextRef++;
          order.push({ created: ref });
          ops.creates.push({ ref, dayId: d.id, fields: p.fields, path: p.path });
          diff.places.created.push({ path: p.path, name: p.fields.name });
          if (p.arrive !== undefined) {
            ops.arrives.push({ ref: { created: ref }, arrive: p.arrive, path: p.path });
            diff.legs.updated.push({ path: p.path, fields: ['arrive'] });
          }
        }
      }
    }
    // Kept: not listed anywhere (or listed here, already placed), unless pruned.
    for (const id of old) {
      const dest = listedIn.get(id);
      if (dest !== undefined) continue; // listed (here or elsewhere)
      if (d.places && parsed.prune) {
        ops.deletes.push(id);
        diff.places.deleted.push({ id, name: rowById.get(id)!.name });
      } else order.push({ existing: id });
    }
    const finalIds = order.map((r) => ('existing' in r ? r.existing : `#${r.created}`));
    if (finalIds.length !== old.length || finalIds.some((id, i) => id !== old[i])) ops.finalOrder.set(d.id, order);
  }

  // Moves: cross-day, plus same-day places outside the LIS of old positions.
  for (const [dayId, order] of ops.finalOrder) {
    const stayers: { id: string; to: number; from: number }[] = [];
    order.forEach((r, to) => {
      if (!('existing' in r)) return;
      const o = oldPos.get(r.existing)!;
      if (o.dayId !== dayId) {
        diff.places.moved.push({ id: r.existing, fromDay: o.dayId, from: o.pos, toDay: dayId, to });
      } else stayers.push({ id: r.existing, to, from: o.pos });
    });
    const keep = lisKeep(stayers.map((s) => s.from));
    stayers.forEach((s, i) => {
      if (!keep.has(i)) diff.places.moved.push({ id: s.id, fromDay: dayId, from: s.from, toDay: dayId, to: s.to });
    });
  }

  // Field updates + arrives of existing places.
  for (const d of parsed.days) {
    for (const p of d.places ?? []) {
      if (p.kind !== 'existing') continue;
      const row = rowById.get(p.id)!;
      const fields = changedFields(row, p.patch);
      if (fields.length) {
        const patch = Object.fromEntries(fields.map((k) => [k, (p.patch as Record<string, unknown>)[k]])) as Partial<PlaceFields>;
        ops.updates.push({ id: p.id, patch });
        diff.places.updated.push({ id: p.id, fields });
      }
      if (p.arrive !== undefined) {
        ops.arrives.push({ ref: { existing: p.id }, arrive: p.arrive, path: p.path });
        if (!same(currentArrive(p.id), p.arrive)) diff.legs.updated.push({ path: p.path, fields: ['arrive'] });
      }
    }
  }
  return { ops, diff };
}

export function diffIsEmpty(diff: PlanDiff): boolean {
  return (
    diff.days.updated.length +
      diff.places.created.length +
      diff.places.updated.length +
      diff.places.moved.length +
      diff.places.deleted.length +
      diff.legs.updated.length ===
    0
  );
}
