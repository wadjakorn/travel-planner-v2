import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {}, dbNode: {} }));

import { collectTripWarnings } from './import-warnings';
import type { ParsedImportPlan } from './import-input';

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

const codes = (p: ParsedImportPlan) => collectTripWarnings(p).map((w) => w.code).sort();

describe('collectTripWarnings', () => {
  it('returns [] for an empty plan', () => {
    expect(collectTripWarnings(plan())).toEqual([]);
  });

  it('night_without_hotel: a dated day with no covering hotel', () => {
    const w = collectTripWarnings(plan({ days: [{ date: '2026-01-01', places: [] }] }));
    expect(w).toEqual([
      { code: 'night_without_hotel', path: '/days/0', message: expect.any(String) },
    ]);
  });

  it('night_without_hotel: suppressed when a hotel covers that night', () => {
    const p = plan({
      days: [{ date: '2026-01-01', places: [] }],
      hotels: [{ name: 'H', checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
    });
    expect(codes(p)).toEqual([]);
  });

  it('night_without_hotel: checkout day is not a covered night', () => {
    const p = plan({
      days: [{ date: '2026-01-02', places: [] }],
      hotels: [{ name: 'H', checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
    });
    expect(codes(p)).toEqual(['night_without_hotel']);
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
      sections: { transport: [], expenses: [{ amount: 300 }], notes: [], budget: { amount: 1000, basis: 'total' } },
    });
    expect(codes(p)).toEqual(['over_budget']);
  });

  it('over_budget: suppressed when estimate is within budget', () => {
    const p = plan({
      hotels: [{ name: 'H', costAmount: 400, checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: { transport: [], expenses: [], notes: [], budget: { amount: 1000, basis: 'total' } },
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
      sections: { transport: [], expenses: [], notes: [], budget: { amount: 100, basis: 'per_day' } },
    });
    // estimate 250 > 100 * 2 = 200 → over.
    expect(codes(p)).toEqual(['over_budget']);
  });

  it('over_budget: per_person basis is skipped (no traveler count)', () => {
    const p = plan({
      hotels: [{ name: 'H', costAmount: 9999, checkInDate: '2026-01-01', checkOutDate: '2026-01-02' }],
      sections: { transport: [], expenses: [], notes: [], budget: { amount: 1, basis: 'per_person' } },
    });
    expect(codes(p)).toEqual([]);
  });
});
