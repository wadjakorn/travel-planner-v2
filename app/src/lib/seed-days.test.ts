import { describe, it, expect } from 'vitest';
import { dayRowFields, parseISODate } from './seed-days';

describe('dayRowFields', () => {
  it('derives label/num/date from a real date, title from index', () => {
    // 2026-11-01 is a Sunday.
    const d = parseISODate('2026-11-01')!;
    expect(dayRowFields(0, d)).toEqual({
      label: 'Sun',
      num: 1,
      date: 'Sunday, November 1',
      dateIso: null,
      title: 'Day 1',
    });
  });

  it('passes through the machine dateIso when the caller supplies it', () => {
    const d = parseISODate('2026-11-01')!;
    expect(dayRowFields(0, d, '2026-11-01')).toEqual({
      label: 'Sun',
      num: 1,
      date: 'Sunday, November 1',
      dateIso: '2026-11-01',
      title: 'Day 1',
    });
  });

  it('falls back to Day N labels when there is no date', () => {
    expect(dayRowFields(2, null)).toEqual({
      label: 'Day',
      num: 3,
      date: 'Day 3',
      dateIso: null,
      title: 'Day 3',
    });
  });
});

describe('parseISODate', () => {
  it('parses a valid ISO date', () => {
    expect(parseISODate('2026-11-05')).toEqual(new Date(2026, 10, 5));
  });
  it('returns null for a bad string', () => {
    expect(parseISODate('nope')).toBeNull();
  });
});
