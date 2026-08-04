import { describe, it, expect } from 'vitest';
import { parseBudgetConfig } from './budget-config';

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
});
