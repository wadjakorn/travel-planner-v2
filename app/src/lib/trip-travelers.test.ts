import { describe, it, expect } from 'vitest';
import { resolveTravelers, resolveBudgetTarget } from './trip-travelers';

describe('resolveTravelers', () => {
  it('falls back to owner + editors when no explicit count is set', () => {
    expect(resolveTravelers(null, 0)).toBe(1);
    expect(resolveTravelers(undefined, 3)).toBe(4);
  });

  it('uses the explicit count, even when it is below the member count', () => {
    expect(resolveTravelers(4, 0)).toBe(4);
    expect(resolveTravelers(2, 5)).toBe(2);
  });
});

describe('resolveBudgetTarget', () => {
  it('resolvedBudget per_person uses resolveTravelers', () => {
    expect(
      resolveBudgetTarget({ amount: 500, basis: 'per_person' }, resolveTravelers(4, 0), 5),
    ).toBe(2000);
  });

  it('per_day multiplies by real days and is null with no days', () => {
    expect(resolveBudgetTarget({ amount: 100, basis: 'per_day' }, 1, 5)).toBe(500);
    expect(resolveBudgetTarget({ amount: 100, basis: 'per_day' }, 1, 0)).toBeNull();
  });

  it('total is the amount as typed', () => {
    expect(resolveBudgetTarget({ amount: 500, basis: 'total' }, 4, 5)).toBe(500);
  });

  it('is null with no config or no amount', () => {
    expect(resolveBudgetTarget(null, 4, 5)).toBeNull();
    expect(resolveBudgetTarget({ amount: null, basis: 'total', travelers: 4 }, 4, 5)).toBeNull();
  });
});
