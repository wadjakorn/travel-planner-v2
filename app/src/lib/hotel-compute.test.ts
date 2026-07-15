import { describe, it, expect } from 'vitest';
import { computeNights, nightsLabel, computeCheckOut } from './hotel-compute';

describe('computeNights', () => {
  it('counts whole nights between two dates', () => {
    expect(computeNights('2026-04-10', '2026-04-12')).toBe(2);
    expect(computeNights('2026-04-10', '2026-04-11')).toBe(1);
  });
  it('is zero for a same-day span', () => {
    expect(computeNights('2026-04-10', '2026-04-10')).toBe(0);
  });
  it('spans months and years correctly', () => {
    expect(computeNights('2026-01-30', '2026-02-02')).toBe(3);
    expect(computeNights('2026-12-31', '2027-01-01')).toBe(1);
  });
  it('returns null when a date is missing', () => {
    expect(computeNights(null, '2026-04-12')).toBeNull();
    expect(computeNights('2026-04-10', null)).toBeNull();
    expect(computeNights('', '')).toBeNull();
    expect(computeNights(undefined, undefined)).toBeNull();
  });
  it('returns null when check-out precedes check-in', () => {
    expect(computeNights('2026-04-12', '2026-04-10')).toBeNull();
  });
  it('returns null for malformed input', () => {
    expect(computeNights('not-a-date', '2026-04-12')).toBeNull();
    expect(computeNights('2026-04-10', 'nope')).toBeNull();
  });
});

describe('nightsLabel', () => {
  it('singular / plural', () => {
    expect(nightsLabel(1)).toBe('1 night');
    expect(nightsLabel(2)).toBe('2 nights');
    expect(nightsLabel(0)).toBe('0 nights');
  });
  it('empty string for null', () => {
    expect(nightsLabel(null)).toBe('');
  });
});

describe('computeCheckOut', () => {
  it('adds nights to the check-in date', () => {
    expect(computeCheckOut('2026-04-10', 2)).toBe('2026-04-12');
    expect(computeCheckOut('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('returns null on missing / invalid input', () => {
    expect(computeCheckOut(null, 2)).toBeNull();
    expect(computeCheckOut('2026-04-10', null)).toBeNull();
    expect(computeCheckOut('2026-04-10', -1)).toBeNull();
    expect(computeCheckOut('bad', 2)).toBeNull();
  });
});
