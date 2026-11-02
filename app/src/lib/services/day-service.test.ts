import { describe, it, expect } from 'vitest';
import { deriveDayDate, rederiveShiftedDays } from './day-service';

// TP-0037: addDay derives the day date from trip.startDate + idx, writing the
// machine date to day.date_iso. These assertions lock the derivation (the DB
// insert itself is covered by the gated integration suites).
describe('deriveDayDate', () => {
  it('derives date_iso as startDate + idx (idx 0 = the start date)', () => {
    expect(deriveDayDate('2026-04-12', 0).dateIso).toBe('2026-04-12');
    expect(deriveDayDate('2026-04-12', 3).dateIso).toBe('2026-04-15');
  });

  it('crosses month/year boundaries via addDaysIso', () => {
    expect(deriveDayDate('2026-12-30', 3).dateIso).toBe('2027-01-02');
  });

  it('returns a null date_iso when the trip has no start date', () => {
    expect(deriveDayDate(null, 0).dateIso).toBeNull();
    expect(deriveDayDate(null, 5).dateIso).toBeNull();
  });

  it('no longer assumes the current year (the old reverse-parse bug)', () => {
    // A trip years away from "now" must keep its own year in both the machine
    // date and the human display — the old code defaulted the year to today's.
    const far = deriveDayDate('2031-07-04', 1);
    expect(far.dateIso).toBe('2031-07-05');
    // 2031-07-05 is a Saturday; display is derived from the real date.
    expect(far.date).toBe('Saturday, July 5');
    expect(far.label).toBe('Sat');
    expect(far.num).toBe(5);
    expect(new Date().getFullYear()).not.toBe(2031);
  });
});

// TP-0055: removeDay repacks idx, so the survivors after the removed day slide
// one slot earlier and their dates must be re-derived from the new idx.
describe('rederiveShiftedDays', () => {
  it('re-derives each shifted survivor from startDate + its new idx', () => {
    // 4-day trip from 2026-04-12; day idx 1 removed → old idx 2,3 are now 1,2.
    const out = rederiveShiftedDays('2026-04-12', [
      { id: 'c', idx: 1 },
      { id: 'd', idx: 2 },
    ]);
    expect(out.map((u) => [u.id, u.dateIso])).toEqual([
      ['c', '2026-04-13'],
      ['d', '2026-04-14'],
    ]);
    expect(out[0]).toMatchObject({ label: 'Mon', num: 13, date: 'Monday, April 13' });
  });

  it('leaves days alone when the trip has no start date', () => {
    expect(rederiveShiftedDays(null, [{ id: 'c', idx: 1 }])).toEqual([]);
  });

  it('is a no-op when the last day was removed (no survivors shifted)', () => {
    expect(rederiveShiftedDays('2026-04-12', [])).toEqual([]);
  });
});
