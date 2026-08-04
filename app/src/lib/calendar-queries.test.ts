import { describe, expect, it } from 'vitest';
import { addDaysIso, expandSpan, hotelLastNight, parseLooseDate } from './calendar-queries';

describe('addDaysIso', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysIso('2026-01-30', 3)).toBe('2026-02-02');
  });

  it('handles leap day', () => {
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('subtracts across a year boundary', () => {
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('expandSpan', () => {
  it('returns the single day when there is no end', () => {
    expect(expandSpan('2026-04-12', null)).toEqual(['2026-04-12']);
  });

  it('is inclusive of both ends', () => {
    expect(expandSpan('2026-04-12', '2026-04-14')).toEqual([
      '2026-04-12',
      '2026-04-13',
      '2026-04-14',
    ]);
  });

  it('collapses an end before the start rather than returning nothing', () => {
    expect(expandSpan('2026-04-12', '2026-04-10')).toEqual(['2026-04-12']);
  });

  it('caps a nonsensical span so one bad row cannot flood the calendar', () => {
    expect(expandSpan('2026-01-01', '2999-01-01')).toHaveLength(366);
  });
});

describe('hotelLastNight', () => {
  it('excludes the checkout date — 3 nights occupies 3 cells', () => {
    const last = hotelLastNight('2026-04-12', '2026-04-15', null);
    expect(last).toBe('2026-04-14');
    expect(expandSpan('2026-04-12', last)).toHaveLength(3);
  });

  it('falls back to nights when there is no checkout date', () => {
    expect(hotelLastNight('2026-04-12', null, 3)).toBe('2026-04-14');
  });

  it('prefers the checkout date over nights when both exist', () => {
    expect(hotelLastNight('2026-04-12', '2026-04-13', 9)).toBe('2026-04-12');
  });

  it('degrades to a single day for a same-day checkout', () => {
    expect(hotelLastNight('2026-04-12', '2026-04-12', null)).toBe('2026-04-12');
  });

  it('degrades to a single day with neither checkout nor nights', () => {
    expect(hotelLastNight('2026-04-12', null, null)).toBe('2026-04-12');
  });
});

describe('parseLooseDate', () => {
  it('passes an ISO date through', () => {
    expect(parseLooseDate('2026-04-12T10:00:00Z')).toBe('2026-04-12');
  });

  it('returns null for junk', () => {
    expect(parseLooseDate('not a date')).toBeNull();
  });
});
