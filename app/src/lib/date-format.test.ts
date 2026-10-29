import { describe, expect, it } from 'vitest';
import { dayDisplay, formatTripRange } from './date-format';

// trip-card.tsx's formatter before i18n P6, verbatim.
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function legacyRange(start?: string | null, end?: string | null): string {
  if (!start) return '';
  const [sy, sm, sd] = start.split('-').map(Number);
  const startStr = `${MONTH[sm - 1]} ${sd}`;
  if (!end) return startStr;
  const [ey, em, ed] = end.split('-').map(Number);
  const endStr = `${MONTH[em - 1]} ${ed}, ${ey}`;
  if (sy !== ey) return `${startStr}, ${sy} – ${endStr}`;
  if (sm !== em) return `${startStr} – ${endStr}`;
  return `${startStr}–${ed}, ${ey}`;
}

describe('formatTripRange', () => {
  const cases: [string | null, string | null][] = [
    [null, null],
    ['2026-07-12', null],
    ['2026-07-12', '2026-07-15'],
    ['2026-07-30', '2026-08-02'],
    ['2026-12-30', '2027-01-02'],
    ['2026-09-01', '2026-09-01'],
  ];

  it('English is byte-identical to the pre-i18n formatter', () => {
    for (const [s, e] of cases) expect(formatTripRange(s, e, 'en')).toBe(legacyRange(s, e));
  });

  it('Thai uses Thai months and Gregorian years', () => {
    expect(formatTripRange('2026-07-12', '2026-07-15', 'th')).toBe('12–15 ก.ค. 2026');
    expect(formatTripRange('2026-12-30', '2027-01-02', 'th')).toContain('2027');
    expect(formatTripRange('2026-07-12', null, 'th')).toBe('12 ก.ค.');
  });
});

describe('dayDisplay', () => {
  const stored = { label: 'Sun', date: 'Sunday, July 12' };

  it('English shows the stored day text', () => {
    expect(dayDisplay(stored, '2026-07-12', 'en')).toEqual(stored);
  });

  it('Thai formats the ISO date, falling back to the stored text without one', () => {
    expect(dayDisplay(stored, '2026-07-12', 'th')).toEqual({ label: 'อา', date: 'วันอาทิตย์ที่ 12 กรกฎาคม' });
    expect(dayDisplay(stored, null, 'th')).toEqual(stored);
  });
});
