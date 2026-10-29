import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {}, dbNode: {} }));

import { collectTripWarnings } from './import-warnings';
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

const codes = (p: ParsedImportPlan) => collectTripWarnings(p).map((w) => w.code).sort();

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
