// Currency normalization at the service boundary.
//
// This lives in the service layer on purpose. POST /api/v1/.../expenses goes
// straight through pick() into the DB without touching any form code, so a
// normalization rule that only existed in the React forms would be bypassed by
// every API caller — and a row holding "usd" instead of "USD" drops out of the
// budget roll-up silently, with a UI that looks completely normal.

import { normalizeCurrency, CurrencyFormatError } from '@/lib/currency';
import { ServiceError } from './service-error';

// Mutates `fields` in place. Absent key → untouched (so PATCH semantics hold);
// empty string → null.
export function normalizeCurrencyField(
  fields: Record<string, unknown>,
  key: string,
): void {
  if (fields[key] === undefined) return;
  try {
    fields[key] = normalizeCurrency(fields[key]);
  } catch (e) {
    if (e instanceof CurrencyFormatError) {
      throw new ServiceError(
        'bad_request',
        `"${key}" must be a 3-letter currency code (e.g. "USD")`,
      );
    }
    throw e;
  }
}
