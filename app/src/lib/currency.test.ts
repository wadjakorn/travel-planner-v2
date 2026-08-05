import { describe, it, expect } from 'vitest';
import {
  normalizeCurrency,
  normalizeCurrencyRequired,
  CurrencyFormatError,
} from './currency';

describe('normalizeCurrency', () => {
  it('uppercases and trims', () => {
    expect(normalizeCurrency('usd')).toBe('USD');
    expect(normalizeCurrency(' thb ')).toBe('THB');
  });

  it('treats absent and empty as null', () => {
    expect(normalizeCurrency(null)).toBeNull();
    expect(normalizeCurrency(undefined)).toBeNull();
    expect(normalizeCurrency('')).toBeNull();
    expect(normalizeCurrency('   ')).toBeNull();
  });

  it('rejects anything that is not alpha-3', () => {
    // Intl.NumberFormat throws RangeError on these — they must never reach
    // the DB, or the budget page crashes for whoever opens it next.
    for (const bad of ['฿', 'US', 'USDX', 'US1', '$']) {
      expect(() => normalizeCurrency(bad)).toThrow(CurrencyFormatError);
    }
  });

  it('falls back only when the value is absent, never when it is invalid', () => {
    expect(normalizeCurrencyRequired(null, 'THB')).toBe('THB');
    expect(normalizeCurrencyRequired('eur', 'THB')).toBe('EUR');
    expect(() => normalizeCurrencyRequired('฿', 'THB')).toThrow(CurrencyFormatError);
  });
});
