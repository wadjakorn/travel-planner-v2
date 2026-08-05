import { describe, it, expect } from 'vitest';
import { effectiveCurrency, inferCurrency, resolveTripCurrency } from './trip-currency';

describe('inferCurrency', () => {
  it('picks the most-used code', () => {
    expect(inferCurrency(['THB', 'THB', 'USD'])).toBe('THB');
  });

  it('normalizes case and whitespace before tallying', () => {
    expect(inferCurrency([' thb ', 'THB', 'usd'])).toBe('THB');
  });

  it('ignores rows with no currency', () => {
    expect(inferCurrency([null, '', '  ', 'JPY'])).toBe('JPY');
  });

  it('breaks ties alphabetically, so the answer does not depend on row order', () => {
    expect(inferCurrency(['USD', 'THB'])).toBe('THB');
    expect(inferCurrency(['THB', 'USD'])).toBe('THB');
  });

  it('returns null when nothing carries a currency', () => {
    expect(inferCurrency([null, null])).toBeNull();
  });
});

describe('resolveTripCurrency', () => {
  it('an explicit choice always wins over the data', () => {
    expect(resolveTripCurrency('USD', ['THB', 'THB'])).toBe('USD');
  });

  it('infers while nothing has been chosen', () => {
    expect(resolveTripCurrency(null, ['THB'])).toBe('THB');
  });

  it('falls back to USD on an empty trip', () => {
    expect(resolveTripCurrency(null, [])).toBe('USD');
  });
});

describe('effectiveCurrency', () => {
  it('treats a missing code as the trip currency, so the row follows the trip', () => {
    expect(effectiveCurrency(null, 'THB')).toBe('THB');
    expect(effectiveCurrency('', 'THB')).toBe('THB');
    expect(effectiveCurrency('   ', 'THB')).toBe('THB');
  });

  it('keeps an explicit code, normalized', () => {
    expect(effectiveCurrency(' jpy ', 'THB')).toBe('JPY');
  });
});
