import { describe, it, expect } from 'vitest';
import {
  keepStoredTravelers,
  parseBudgetConfig,
  parseBudgetConfigInput,
  parseTravelers,
} from './budget-config';
import { ServiceError } from '@/lib/services/service-error';

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('parseBudgetConfig', () => {
  it('reads an amount with its basis', () => {
    expect(parseBudgetConfig(fd({ amount: '5000', basis: 'per_person' }))).toEqual({
      amount: 5000,
      basis: 'per_person',
      caps: undefined,
    });
  });

  it('keeps caps when no overall amount is set', () => {
    // "Leave blank for no budget" is a supported choice — it must not take
    // the per-category caps down with it.
    const cfg = parseBudgetConfig(fd({ amount: '', basis: 'total', cap_food: '300' }));
    expect(cfg).toEqual({ amount: null, basis: 'total', caps: { food: 300 } });
  });

  it('keeps caps when the amount is cleared to zero', () => {
    const cfg = parseBudgetConfig(fd({ amount: '0', basis: 'total', cap_hotels: '900' }));
    expect(cfg?.amount).toBeNull();
    expect(cfg?.caps).toEqual({ hotels: 900 });
  });

  it('clears the config only when neither amount nor caps are set', () => {
    expect(parseBudgetConfig(fd({ amount: '', basis: 'total' }))).toBeNull();
  });

  it('ignores blank cap fields', () => {
    const cfg = parseBudgetConfig(
      fd({ amount: '100', basis: 'total', cap_food: '', cap_hotels: '50' }),
    );
    expect(cfg?.caps).toEqual({ hotels: 50 });
  });

  it('rejects a cap under an unknown category instead of storing it', () => {
    // jsonb would accept "hotel" happily; the cap would then apply to nothing
    // and the user would never find out.
    expect(() => parseBudgetConfig(fd({ amount: '100', basis: 'total', cap_hotel: '50' })))
      .toThrow(/Unknown budget category/);
  });

  it('rejects a negative amount and a negative cap', () => {
    expect(() => parseBudgetConfig(fd({ amount: '-1', basis: 'total' }))).toThrow();
    expect(() => parseBudgetConfig(fd({ amount: '10', basis: 'total', cap_food: '-5' })))
      .toThrow(/Invalid cap/);
  });

  it('rejects an unknown basis', () => {
    expect(() => parseBudgetConfig(fd({ amount: '10', basis: 'weekly' }))).toThrow();
  });

  it('travelers alone keeps a config', () => {
    expect(parseBudgetConfig(fd({ amount: '', basis: 'total', travelers: '4' }))).toEqual({
      amount: null,
      basis: 'total',
      caps: undefined,
      travelers: 4,
    });
    expect(parseBudgetConfig(fd({ amount: '', basis: 'total', travelers: '' }))).toBeNull();
  });

  it('rejects an out-of-range travelers count', () => {
    expect(() => parseBudgetConfig(fd({ amount: '100', basis: 'total', travelers: '0' })))
      .toThrow(/Travelers must be a whole number from 1 to 99/);
  });
});

describe('parseTravelers', () => {
  it('reads blank as unset and a whole number as itself', () => {
    expect(parseTravelers('')).toBeUndefined();
    expect(parseTravelers(null)).toBeUndefined();
    expect(parseTravelers('4')).toBe(4);
  });

  it('rejects zero, over 99, fractions and text', () => {
    for (const v of ['0', '100', '2.5', 'abc']) {
      expect(() => parseTravelers(v)).toThrow('Travelers must be a whole number from 1 to 99');
    }
  });
});

describe('parseBudgetConfigInput (JSON / REST API)', () => {
  it('reads {amount, basis, caps} from an object', () => {
    expect(
      parseBudgetConfigInput({ amount: 5000, basis: 'per_person', caps: { hotels: 1200 } }),
    ).toEqual({ amount: 5000, basis: 'per_person', caps: { hotels: 1200 } });
  });

  it('defaults basis to total and keeps caps when amount is absent', () => {
    expect(parseBudgetConfigInput({ caps: { food: 300 } })).toEqual({
      amount: null,
      basis: 'total',
      caps: { food: 300 },
    });
  });

  it('returns null when neither an amount nor a cap is set', () => {
    expect(parseBudgetConfigInput({})).toBeNull();
    expect(parseBudgetConfigInput(null)).toBeNull();
    expect(parseBudgetConfigInput(undefined)).toBeNull();
    expect(parseBudgetConfigInput({ amount: 0 })).toBeNull();
  });

  it('rejects a cap under an unknown category with bad_request', () => {
    try {
      parseBudgetConfigInput({ amount: 100, caps: { hotel: 50 } });
      throw new Error('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect((e as ServiceError).code).toBe('bad_request');
      expect((e as ServiceError).message).toMatch(/Unknown budget category "hotel"/);
    }
  });

  it('rejects a negative amount, a negative cap, and a bad basis', () => {
    expect(() => parseBudgetConfigInput({ amount: -1 })).toThrow(ServiceError);
    expect(() => parseBudgetConfigInput({ caps: { food: -5 } })).toThrow(ServiceError);
    expect(() => parseBudgetConfigInput({ amount: 10, basis: 'weekly' })).toThrow(ServiceError);
  });

  it('travelers alone keeps a config', () => {
    expect(parseBudgetConfigInput({ travelers: 4 })).toEqual({
      amount: null,
      basis: 'total',
      caps: undefined,
      travelers: 4,
    });
  });

  it('treats a null travelers as unset and omits the key', () => {
    expect(parseBudgetConfigInput({ travelers: null })).toBeNull();
    const cfg = parseBudgetConfigInput({ amount: 100 });
    expect(cfg).not.toBeNull();
    expect('travelers' in cfg!).toBe(false);
  });

  it('rejects a travelers count that is not a whole number from 1 to 99', () => {
    for (const travelers of [0, 2.5, 100, '4']) {
      try {
        parseBudgetConfigInput({ travelers });
        throw new Error('expected a throw');
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe('bad_request');
        expect((e as ServiceError).message).toBe(
          '"budget.travelers" must be a whole number from 1 to 99',
        );
      }
    }
  });

  it('rejects a non-object budget', () => {
    expect(() => parseBudgetConfigInput([])).toThrow(ServiceError);
    expect(() => parseBudgetConfigInput('x')).toThrow(ServiceError);
  });
});

describe('keepStoredTravelers (REST PATCH)', () => {
  const stored = { amount: 500, basis: 'per_person' as const, travelers: 4 };

  it('keeps the stored headcount when a budget PATCH omits travelers', () => {
    expect(keepStoredTravelers({ amount: 2000, basis: 'total' }, stored)).toEqual({
      amount: 2000,
      basis: 'total',
      travelers: 4,
    });
  });

  it('keeps it when the budget itself is cleared', () => {
    expect(keepStoredTravelers(null, stored)).toEqual({
      amount: null,
      basis: 'total',
      travelers: 4,
    });
  });

  it('is a no-op when nothing was stored', () => {
    expect(keepStoredTravelers(null, null)).toBeNull();
    expect(keepStoredTravelers({ amount: 1, basis: 'total' }, { amount: 9, basis: 'total' })).toEqual({
      amount: 1,
      basis: 'total',
    });
  });
});
