// Rebase guard (TP-0141): import `arrive` rides on ParsedImportPlan
// `days[].arrives`, and the commit path runs the plan through the REAL
// resolvePlanLinks. A rewrite of resolvePlanLinks (TP-0140) that rebuilds
// days field by field would silently drop it — this fails first. Kept in its
// own file so it does not conflict with place-link.test.ts.

import { describe, it, expect } from 'vitest';
import { resolvePlanLinks, LinkBudget } from './place-link';
import { parsePlaceFields } from './place-input';
import type { ParsedImportPlan } from './import-input';

const noLookup = async () => {
  throw new Error('no lookup expected: every place already has coords');
};

describe('resolvePlanLinks keeps days[].arrives', () => {
  it('passes arrives through unchanged when no place needs a lookup', async () => {
    const at = (name: string, lat: number, lng: number) => ({
      ...parsePlaceFields({ name, kind: 'sight' }),
      lat,
      lng,
    });
    const arrives0 = [
      { mode: 'transit' as const, durationMin: 40, note: 'Airport rail' },
      null,
      { mode: 'walk' as const, durationMin: null, note: 'Along the river' },
    ];
    const arrives1 = [null, { mode: 'drive' as const, durationMin: 90, note: null }];
    const plan: ParsedImportPlan = {
      trip: { title: 'T', subtitle: null, startDate: null, endDate: null, cover: null },
      days: [
        { date: null, places: [at('A', 1, 1), at('B', 2, 2), at('C', 3, 3)], arrives: arrives0 },
        { date: null, places: [at('D', 4, 4), at('E', 5, 5)], arrives: arrives1 },
      ],
      hotels: [],
    };
    const before = structuredClone(plan);
    const r = await resolvePlanLinks('u1', plan, [[null, null, null], [null, null]], {
      readLink: noLookup as never,
      search: noLookup as never,
      budget: new LinkBudget('u1'),
    });
    expect(r.warnings).toEqual([]);
    expect(r.plan.days.map((d) => d.arrives)).toEqual([arrives0, arrives1]);
    expect(r.plan.days.map((d) => d.places)).toEqual(before.days.map((d) => d.places));
    expect(plan).toEqual(before);
  });
});
