import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {}, dbNode: {} }));

import { collectTripWarnings, hotelWarnings, transportWarnings } from './import-warnings';
import type { ParsedImportPlan } from './import-input';
import type { ParsedBudgetSection, ParsedExpense } from './import-sections';
import type { TripBudgetConfig } from '@/db/schema';

// Minimal plan builder — only the fields the rules read.
function plan(over: Partial<ParsedImportPlan> = {}): ParsedImportPlan {
  return {
    trip: { title: 'T', subtitle: null, startDate: null, endDate: null, cover: null },
    days: [],
    hotels: [],
    sections: { transport: [], expenses: [], notes: [], budget: null },
    ...over,
  } as ParsedImportPlan;
}

const place = (over: Record<string, unknown> = {}) =>
  ({ kind: 'sight', name: 'P', lat: 1, lng: 2, time: '09:00', tags: [] as string[], ...over }) as never;

// Typed builders that lock the TP-0040 parsed shapes — the budget target lives
// under `config` (ParsedBudgetSection = { config, currency }) and an expense's
// amount under `values` (ParsedExpense = { values: { category, amount }, splits }).
// Using the real types (no `as`) makes tsc reject a flat `{ amount }` regression.
const budgetSection = (
  config: TripBudgetConfig | null,
  currency: string | null = null,
): ParsedBudgetSection => ({ config, currency });

const expenseItem = (
  category: ParsedExpense['values']['category'],
  amount: number,
): ParsedExpense => ({ values: { category, amount }, splits: undefined });

// Pre-TP-0143 rule tests use coordinate-less hotels; hotel_* codes are covered
// in their own describe below, so exclude them here.
const codes = (p: ParsedImportPlan) =>
  collectTripWarnings(p)
    .map((w) => w.code)
    .filter((c) => !c.startsWith('hotel_'))
    .sort();

describe('collectTripWarnings', () => {
  it('returns [] for an empty plan', () => {
    expect(collectTripWarnings(plan())).toEqual([]);
  });

  it('night_without_hotel: an uncovered night before the final day', () => {
    // 2-day trip, no hotels: day 0 is a night (warns), day 1 is the checkout
    // morning (exempt).
    const w = collectTripWarnings(
      plan({ days: [{ date: '2026-01-01', places: [] }, { date: '2026-01-02', places: [] }] }),
    );
    expect(w).toEqual([
      { code: 'night_without_hotel', path: '/days/0', message: expect.any(String) },
    ]);
  });

  it('night_without_hotel: complete 3-day / 2-night trip emits ZERO night warnings', () => {
    // Hotel covers both nights (01-01, 01-02); day 2 (01-03) is checkout.
    const p = plan({
      days: [
        { date: '2026-01-01', places: [] },
        { date: '2026-01-02', places: [] },
        { date: '2026-01-03', places: [] },
      ],
      hotels: [{ name: 'H', checkInDate: '2026-01-01', checkOutDate: '2026-01-03' }],
    });
    expect(collectTripWarnings(p).filter((w) => w.code === 'night_without_hotel')).toEqual([]);
  });

  it('night_without_hotel: a middle night with no hotel warns (final day still exempt)', () => {
    const p = plan({
      days: [
        { date: '2026-01-01', places: [] },
        { date: '2026-01-02', places: [] },
        { date: '2026-01-03', places: [] },
      ],
      // Only night 01-01 is covered; 01-02 is an uncovered middle night.
      hotels: [{ name: 'H', checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
    });
    expect(collectTripWarnings(p).filter((w) => w.code === 'night_without_hotel')).toEqual([
      { code: 'night_without_hotel', path: '/days/1', message: expect.any(String) },
    ]);
  });

  it('place_without_coords: non-transit place with null lat/lng', () => {
    const p = plan({
      days: [{ date: '2026-01-01', places: [place({ lat: null, lng: null })] }],
      hotels: [{ name: 'H', checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
    });
    const w = collectTripWarnings(p);
    expect(w).toContainEqual({ code: 'place_without_coords', path: '/days/0/places/0', message: expect.any(String) });
  });

  it('transit place with no coords does NOT warn place_without_coords', () => {
    const p = plan({
      days: [{ date: '2026-01-01', places: [place({ kind: 'transit', lat: null, lng: null, time: '08:00' })] }],
      hotels: [{ name: 'H', checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
    });
    expect(codes(p)).toEqual([]);
  });

  it('flight_without_time: transit place missing a time', () => {
    const p = plan({
      days: [{ date: '2026-01-01', places: [place({ kind: 'transit', lat: null, lng: null, time: null })] }],
      hotels: [{ name: 'H', checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
    });
    expect(codes(p)).toEqual(['flight_without_time']);
  });

  it('over_budget: hotel + expense estimate exceeds a total budget', () => {
    const p = plan({
      hotels: [{ name: 'H', costAmount: 800, checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: {
        transport: [],
        expenses: [expenseItem('other', 300)],
        notes: [],
        budget: budgetSection({ amount: 1000, basis: 'total' }),
      },
    });
    // estimate = hotel 800 + expense 300 = 1100 > 1000 → over.
    expect(codes(p)).toEqual(['over_budget']);
  });

  it('over_budget: ignores rows in a different currency than the budget (TP-0139)', () => {
    const p = plan({
      hotels: [{ name: 'H', costAmount: 40000, costCurrency: 'JPY', checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: {
        transport: [],
        expenses: [{ values: { category: 'other', amount: 300, currency: 'THB' }, splits: undefined } as ParsedExpense],
        notes: [],
        budget: budgetSection({ amount: 1000, basis: 'total' }, 'THB'),
      },
    });
    // JPY hotel excluded; THB expense 300 <= 1000 -> no over_budget, one mismatch.
    expect(codes(p)).toEqual(['budget_currency_mismatch']);
    const w = collectTripWarnings(p).find((x) => x.code === 'budget_currency_mismatch');
    expect(w?.path).toBe('/budget');
    expect(w?.message).toContain('1');
  });

  it('budget_currency_mismatch: emitted once for many foreign rows; over_budget still fires on matching rows', () => {
    const p = plan({
      hotels: [
        { name: 'A', costAmount: 5, costCurrency: 'JPY', checkInDate: '2026-01-01', checkOutDate: '2026-01-02' },
        { name: 'B', costAmount: 5, costCurrency: 'usd', checkInDate: '2026-01-02', checkOutDate: '2026-01-03' },
        { name: 'C', costAmount: 2000, costCurrency: 'thb', checkInDate: '2026-01-03', checkOutDate: '2026-01-04' },
      ],
      sections: { transport: [], expenses: [], notes: [], budget: budgetSection({ amount: 1000, basis: 'total' }, 'THB') },
    });
    const ws = collectTripWarnings(p).filter((x) => x.code === 'budget_currency_mismatch');
    expect(ws).toHaveLength(1);
    expect(ws[0].message).toContain('2');
    expect(codes(p)).toContain('over_budget');
  });

  it('over_budget: rows without an explicit currency still count', () => {
    const p = plan({
      hotels: [{ name: 'H', costAmount: 2000, checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: { transport: [], expenses: [], notes: [], budget: budgetSection({ amount: 1000, basis: 'total' }, 'THB') },
    });
    expect(codes(p)).toEqual(['over_budget']);
  });

  it('over_budget: no budget currency known keeps summing every row (a new trip has no other currency source)', () => {
    const p = plan({
      hotels: [{ name: 'H', costAmount: 2000, costCurrency: 'JPY', checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: { transport: [], expenses: [], notes: [], budget: budgetSection({ amount: 1000, basis: 'total' }) },
    });
    expect(codes(p)).toEqual(['over_budget']);
  });

  it('over_budget: suppressed when estimate is within budget', () => {
    const p = plan({
      hotels: [{ name: 'H', costAmount: 400, checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: { transport: [], expenses: [], notes: [], budget: budgetSection({ amount: 1000, basis: 'total' }) },
    });
    expect(codes(p)).toEqual([]);
  });

  it('over_budget: per_day scales the threshold by day count', () => {
    const p = plan({
      days: [
        { date: '2026-01-01', places: [] },
        { date: '2026-01-02', places: [] },
      ],
      // 2 nights covered so no night_without_hotel noise.
      hotels: [{ name: 'H', costAmount: 250, checkInDate: '2026-01-01', checkOutDate: '2026-01-03' }],
      sections: { transport: [], expenses: [], notes: [], budget: budgetSection({ amount: 100, basis: 'per_day' }) },
    });
    // estimate 250 > 100 * 2 = 200 → over.
    expect(codes(p)).toEqual(['over_budget']);
  });

  it('over_budget: per_day on a date-range-only trip uses the expected day count', () => {
    // No explicit days — the 3-day range (01-01..01-03) must scale the budget,
    // not collapse to a 1-day threshold. 250 < 100 * 3 = 300 → within budget.
    const p = plan({
      trip: { title: 'T', subtitle: null, startDate: '2026-01-01', endDate: '2026-01-03', cover: null },
      days: [],
      hotels: [{ name: 'H', costAmount: 250 }],
      sections: { transport: [], expenses: [], notes: [], budget: budgetSection({ amount: 100, basis: 'per_day' }) },
    });
    expect(codes(p)).toEqual([]);
  });

  it('over_budget: per_person scales the threshold by budget.travelers', () => {
    const over = plan({
      hotels: [{ name: 'H', costAmount: 450, checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: { transport: [], expenses: [], notes: [], budget: budgetSection({ amount: 100, basis: 'per_person', travelers: 4 }) },
    });
    // estimate 450 > 100 * 4 = 400 → over.
    expect(codes(over)).toEqual(['over_budget']);
    const within = plan({
      hotels: [{ name: 'H', costAmount: 350, checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: { transport: [], expenses: [], notes: [], budget: budgetSection({ amount: 100, basis: 'per_person', travelers: 4 }) },
    });
    expect(codes(within)).toEqual([]);
  });

  it('over_budget: per_person basis without travelers is skipped (no traveler count)', () => {
    const p = plan({
      hotels: [{ name: 'H', costAmount: 9999, checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: { transport: [], expenses: [], notes: [], budget: budgetSection({ amount: 1, basis: 'per_person' }) },
    });
    expect(codes(p)).toEqual([]);
  });

  it('over_budget: estimate is driven by the NESTED config.amount + values.amount shape', () => {
    // Regression lock for the TP-0040 shape. The whole estimate here comes from
    // a single expense's nested `values.amount` (500), checked against the
    // budget's nested `config.amount` (400) — no hotels. If the rule ever
    // regresses to reading a flat `budget.amount` / `expense.amount`, both reads
    // yield undefined, the estimate collapses to 0, and over_budget never fires.
    const p = plan({
      hotels: [],
      sections: {
        transport: [],
        expenses: [expenseItem('other', 500)],
        notes: [],
        budget: budgetSection({ amount: 400, basis: 'total' }),
      },
    });
    expect(codes(p)).toEqual(['over_budget']);
  });
});

describe('hotel warnings (TP-0143)', () => {
  it('hotel_without_location / hotel_without_dates per hotel with /hotels/i paths', () => {
    const w = collectTripWarnings(
      plan({
        hotels: [
          { name: 'A', lat: 1, lng: 2, checkInDate: '2026-01-01', checkOutDate: '2026-01-02' },
          { name: 'B', status: 'tbd', area: 'B' },
        ] as never,
      }),
    );
    expect(w.filter((x) => x.code.startsWith('hotel_'))).toEqual([
      { code: 'hotel_without_location', path: '/hotels/1', message: expect.any(String) },
      { code: 'hotel_without_dates', path: '/hotels/1', message: expect.any(String) },
    ]);
  });

  it('a confirmed hotel without dates does not warn hotel_without_dates', () => {
    const w = hotelWarnings({ name: 'C', status: 'confirmed', lat: 1, lng: 2 }, '/hotels/0');
    expect(w).toEqual([]);
  });

  it('a tbd hotel with only one date still warns hotel_without_dates', () => {
    const w = hotelWarnings({ name: 'D', status: 'tbd', lat: 1, lng: 2, checkInDate: '2026-01-01' });
    expect(w.map((x) => x.code)).toEqual(['hotel_without_dates']);
  });

  it('hotelWarnings omits path when none is given (REST)', () => {
    expect(hotelWarnings({ name: 'X' })).toEqual([
      { code: 'hotel_without_location', message: expect.any(String) },
    ]);
  });
});

describe('transportWarnings (TP-0142)', () => {
  const codes = (t: Record<string, unknown>, path?: string, dates?: Set<string>) =>
    transportWarnings(t, path, dates).map((w) => w.code);

  it('transport_without_day when no dayIdx and no fromDate', () => {
    const w = transportWarnings({ type: 'train', title: 'x' }, '/transport/2');
    expect(w).toEqual([
      {
        code: 'transport_without_day',
        path: '/transport/2',
        message: 'This ride has no dayIdx or fromDate; it will not appear on any itinerary day.',
      },
    ]);
    expect(transportWarnings({ type: 'train' })[0]).not.toHaveProperty('path');
  });

  it('fromDate or dayIdx set -> none', () => {
    expect(codes({ type: 'train', fromDate: '2027-01-02' })).toEqual([]);
    expect(codes({ type: 'train', dayIdx: 0 })).toEqual([]);
  });

  it('fromDate outside the plan dates -> warns (import)', () => {
    const dates = new Set(['2027-01-01', '2027-01-02']);
    expect(codes({ type: 'train', fromDate: '2027-02-01' }, '/transport/0', dates)).toEqual([
      'transport_without_day',
    ]);
    expect(codes({ type: 'train', fromDate: '2027-01-02' }, '/transport/0', dates)).toEqual([]);
    expect(codes({ type: 'train', dayIdx: 3, fromDate: '2027-02-01' }, undefined, dates)).toEqual([]);
  });

  it('IATA check only for flights, trimmed, uppercase 3 letters', () => {
    const f = (fromCode: string, extra: Record<string, unknown> = {}) =>
      codes({ type: 'flight', dayIdx: 0, fromCode, ...extra });
    expect(f('OSA')).toEqual([]);
    expect(f(' KIX')).toEqual([]);
    expect(f('osa')).toEqual(['iata_code_invalid']);
    expect(f('Osaka')).toEqual(['iata_code_invalid']);
    expect(f('')).toEqual([]);
    expect(codes({ type: 'train', dayIdx: 0, fromCode: 'Namba' })).toEqual([]);
  });

  it('iata warning paths and toCode', () => {
    const w = transportWarnings({ type: 'flight', dayIdx: 0, fromCode: 'bkk', toCode: 'kix' }, '/transport/1');
    expect(w.map((x) => x.path)).toEqual(['/transport/1/fromCode', '/transport/1/toCode']);
    expect(w[0].message).toBe('Flight fromCode should be a 3-letter IATA code (e.g. KIX); it is stored as sent.');
    expect(transportWarnings({ type: 'flight', dayIdx: 0, toCode: 'x' })[0]).not.toHaveProperty('path');
  });

  it('collectTripWarnings: transport after hotels, dates from days / range', () => {
    const t = (over: Record<string, unknown>) => ({ type: 'train', title: 't', ...over }) as never;
    const ranged = plan({
      trip: { title: 'T', subtitle: null, startDate: '2027-01-01', endDate: '2027-01-03', cover: null } as never,
      sections: { transport: [t({ fromDate: '2027-01-02' }), t({ fromDate: '2027-03-01' })], expenses: [], notes: [], budget: null },
    });
    const w = collectTripWarnings(ranged).filter((x) => x.code === 'transport_without_day');
    expect(w.map((x) => x.path)).toEqual(['/transport/1']);

    const undated = plan({
      sections: { transport: [t({ fromDate: '2030-01-01' }), t({})], expenses: [], notes: [], budget: null },
    });
    const w2 = collectTripWarnings(undated).filter((x) => x.code === 'transport_without_day');
    expect(w2.map((x) => x.path)).toEqual(['/transport/1']);

    const explicit = plan({
      days: [{ date: '2027-05-05', places: [] }] as never,
      sections: { transport: [t({ fromDate: '2027-05-05' }), t({ fromDate: '2027-05-06' })], expenses: [], notes: [], budget: null },
    });
    expect(
      collectTripWarnings(explicit).filter((x) => x.code === 'transport_without_day').map((x) => x.path),
    ).toEqual(['/transport/1']);
  });
});
