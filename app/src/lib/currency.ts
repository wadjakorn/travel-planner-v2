// Currency-code normalization, shared by the web actions and the /api/v1
// services. Codes are stored as ISO-4217 alpha-3 UPPERCASE everywhere so the
// budget roll-up can compare them with plain equality.
//
// Validation is deliberately shape-only (three letters), not a hardcoded list
// of live ISO-4217 codes: the list changes, and the thing that actually breaks
// on a bad value is `Intl.NumberFormat(..., { style: 'currency' })`, which
// throws RangeError on anything that is not well-formed alpha-3. Rejecting
// "usd " or "฿" at the write boundary keeps that RangeError off the budget
// page — while an unlisted-but-well-formed code stays harmless.

export class CurrencyFormatError extends Error {
  constructor(public readonly value: string) {
    super(`"${value}" is not a 3-letter currency code`);
    this.name = 'CurrencyFormatError';
  }
}

const ALPHA3 = /^[A-Za-z]{3}$/;

export const DEFAULT_CURRENCY = 'USD';

// Common codes offered in pickers. Not a validation whitelist — any well-formed
// alpha-3 code typed elsewhere is still accepted.
export const COMMON_CURRENCIES = [
  'USD', 'THB', 'EUR', 'GBP', 'JPY', 'KRW', 'SGD', 'AUD', 'CNY', 'TWD',
  'HKD', 'MYR', 'VND', 'IDR', 'PHP', 'INR', 'CHF', 'CAD', 'NZD', 'AED',
] as const;

// null/undefined/empty → null (the column stays empty and the budget roll-up
// treats it as "the trip currency"). Anything else must be alpha-3.
export function normalizeCurrency(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new CurrencyFormatError(String(v));
  const t = v.trim();
  if (t === '') return null;
  if (!ALPHA3.test(t)) throw new CurrencyFormatError(t);
  return t.toUpperCase();
}

// Same rules, but a missing value falls back to the default rather than null.
// Used for trips.currency and expenses.currency, which are NOT NULL.
export function normalizeCurrencyRequired(
  v: unknown,
  fallback = DEFAULT_CURRENCY,
): string {
  return normalizeCurrency(v) ?? fallback;
}
