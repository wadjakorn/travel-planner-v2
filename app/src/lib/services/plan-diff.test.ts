import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { parsePlanUpdate } from '@/lib/api/plan-update-input';
import { computePlanDiff, lisKeep, validatePlanAgainst } from './plan-diff';
import type { PlanSnapshot, PlaceRow } from './plan-snapshot';

const place = (id: string, dayId: string, idx: number, over: Partial<PlaceRow> = {}) =>
  ({ id, dayId, idx, kind: 'sight', name: id.toUpperCase(), status: 'confirmed', time: null, note: null, lat: 1, lng: 2, tags: [], ...over }) as PlaceRow;
const day = (id: string, idx: number) =>
  ({ id, idx, title: `Day ${idx + 1}`, defaultMode: null, startMode: null, startNote: null, startDurationMin: null });

function snap(): PlanSnapshot {
  return {
    tripId: 't',
    updatedAt: new Date('2026-11-06T00:00:00.000Z'),
    days: [day('d1', 0), day('d2', 1)],
    placesByDay: new Map([
      ['d1', [place('p1', 'd1', 0), place('p2', 'd1', 1), place('p3', 'd1', 2)]],
      ['d2', [place('p4', 'd2', 0)]],
    ]),
    segments: [],
    fingerprint: 'x',
  };
}
const V = '2026-11-06T00:00:00.000Z';
const run = (body: Record<string, unknown>, s = snap()) => {
  const parsed = parsePlanUpdate(body);
  validatePlanAgainst(s, parsed);
  return computePlanDiff(s, parsed, () => null);
};
const order = (ops: ReturnType<typeof run>['ops'], d: string) =>
  ops.finalOrder.get(d)?.map((r) => ('existing' in r ? r.existing : `new${r.created}`));

describe('parsePlanUpdate (TP-0146)', () => {
  const ok = { days: [{ id: 'd1' }, { id: 'd2' }] };
  it('rejects unsupported sections with the endpoint to use instead', () => {
    for (const k of ['trip', 'budget', 'hotels', 'transport', 'expenses', 'notes']) {
      expect(() => parsePlanUpdate({ ...ok, [k]: {} })).toThrow(/not supported by PUT \/plan/);
    }
  });
  it('a new day, a day date, prune without version, duplicate ids → 400 with a reason', () => {
    const reason = (b: Record<string, unknown>) => {
      try {
        parsePlanUpdate(b);
      } catch (e) {
        return (e as { extra?: { reason?: string } }).extra?.reason;
      }
    };
    expect(reason({ days: [{ id: 'd1' }, { title: 'new' }] })).toBe('day_order_unsupported');
    expect(reason({ days: [{ id: 'd1', date: '2026-01-01' }] })).toBe('unsupported_field');
    expect(reason({ ...ok, prune: true })).toBe('version_required');
    expect(reason({ days: [{ id: 'd1', places: [{ id: 'p1' }] }, { id: 'd2', places: [{ id: 'p1' }] }] })).toBe('duplicate_id');
    expect(reason({ days: [{ id: 'd1', places: [{ id: 'p1', query: 'x' }] }] })).toBe('bad_field');
  });
  it('field errors carry the body path', () => {
    expect(() => parsePlanUpdate({ days: [{ id: 'd1', places: [{ kind: 'nope', name: 'x' }] }] })).toThrow(/\/days\/0\/places\/0: "kind"/);
  });
});

describe('validatePlanAgainst (TP-0146)', () => {
  it('days must be exactly the stored ids in order; unknown place ids are rejected', () => {
    expect(() => run({ days: [{ id: 'd2' }, { id: 'd1' }] })).toThrow(/current order/);
    expect(() => run({ days: [{ id: 'd1' }] })).toThrow(/current order/);
    expect(() => run({ days: [{ id: 'd1', places: [{ id: 'zz' }] }, { id: 'd2' }] })).toThrow(/not a place of this trip/);
  });
});

describe('computePlanDiff (TP-0146)', () => {
  it('no-op body → no touched day, empty diff', () => {
    const { ops, diff } = run({ days: [{ id: 'd1', places: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] }, { id: 'd2' }] });
    expect(ops.finalOrder.size).toBe(0);
    expect(diff.places).toEqual({ created: [], updated: [], moved: [], deleted: [] });
  });
  it('reorder within a day: LIS keeps the earliest old positions', () => {
    const { ops, diff } = run({ days: [{ id: 'd1', places: [{ id: 'p3' }, { id: 'p1' }, { id: 'p2' }] }, { id: 'd2' }] });
    expect(order(ops, 'd1')).toEqual(['p3', 'p1', 'p2']);
    expect(diff.places.moved).toEqual([{ id: 'p3', fromDay: 'd1', from: 2, toDay: 'd1', to: 0 }]);
  });
  it('cross-day move touches both days; unlisted places stay, appended', () => {
    const { ops, diff } = run({ days: [{ id: 'd1', places: [{ id: 'p3' }] }, { id: 'd2', places: [{ id: 'p4' }, { id: 'p2' }] }] });
    expect(order(ops, 'd1')).toEqual(['p3', 'p1']);
    expect(order(ops, 'd2')).toEqual(['p4', 'p2']);
    expect(diff.places.moved).toContainEqual({ id: 'p2', fromDay: 'd1', from: 1, toDay: 'd2', to: 1 });
    expect(diff.places.deleted).toEqual([]);
  });
  it('a day without `places` that loses a mover is still touched', () => {
    const { ops } = run({ days: [{ id: 'd1' }, { id: 'd2', places: [{ id: 'p1' }, { id: 'p4' }] }] });
    expect(order(ops, 'd1')).toEqual(['p2', 'p3']);
    expect(order(ops, 'd2')).toEqual(['p1', 'p4']);
  });
  it('prune deletes the unlisted places of a sent day only', () => {
    const { ops, diff } = run({ ifUpdatedAt: V, prune: true, days: [{ id: 'd1', places: [{ id: 'p2' }] }, { id: 'd2' }] });
    expect(ops.deletes.sort()).toEqual(['p1', 'p3']);
    expect(diff.places.deleted.map((d) => d.name).sort()).toEqual(['P1', 'P3']);
    expect(order(ops, 'd1')).toEqual(['p2']);
  });
  it('creates, field updates (only real changes) and arrives', () => {
    const { ops, diff } = run({
      days: [
        { id: 'd1', title: 'Kyoto', places: [{ id: 'p1', time: '10:00', note: null }, { id: 'p2' }, { id: 'p3' }] },
        { id: 'd2', places: [{ id: 'p4' }, { kind: 'food', name: 'Nishiki', lat: 1, lng: 2, arrive: { mode: 'walk' } }] },
      ],
    });
    expect(diff.days.updated).toEqual([{ id: 'd1', fields: ['title'] }]);
    expect(diff.places.updated).toEqual([{ id: 'p1', fields: ['time'] }]); // note was already null
    expect(diff.places.created).toEqual([{ path: '/days/1/places/1', name: 'Nishiki' }]);
    expect(order(ops, 'd2')).toEqual(['p4', 'new0']);
    expect(ops.arrives).toEqual([{ ref: { created: 0 }, arrive: { mode: 'walk', durationMin: null, note: null }, path: '/days/1/places/1' }]);
    expect(diff.legs.updated).toEqual([{ path: '/days/1/places/1', fields: ['arrive'] }]);
  });
});

describe('lisKeep (TP-0146)', () => {
  it('[1,0] keeps old position 0 (the design §4 example)', () => {
    expect([...lisKeep([1, 0])]).toEqual([1]);
  });
  it('longest first, then smallest values', () => {
    expect([...lisKeep([2, 0, 1])].sort()).toEqual([1, 2]);
    expect([...lisKeep([0, 1, 2])].sort()).toEqual([0, 1, 2]);
    expect([...lisKeep([])]).toEqual([]);
  });
});
