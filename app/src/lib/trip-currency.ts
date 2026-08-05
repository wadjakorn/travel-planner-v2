// Which currency a trip is tracked in.
//
// `trips.currency` is NULL until someone actually chooses one in budget
// settings. It is deliberately not defaulted to 'USD' in the column: a default
// is indistinguishable from a choice, and "the trip is USD" silently excluded
// every ฿ booking a Thai user had already entered — the total read $0 with
// their money sitting one screen away.
//
// Pure on purpose: the DB-backed loader lives in expense-queries, so unit
// tests of the budget maths never pull a database client into scope.
//
// So when nothing has been chosen, the currency is inferred from the data the
// user has already entered. An explicit choice always wins, and inference
// stops the moment they make one.

import { DEFAULT_CURRENCY } from '@/lib/currency';

// Most-used code among the rows that carry one. Ties break alphabetically so
// the answer is stable across page loads rather than depending on row order.
export function inferCurrency(codes: Array<string | null>): string | null {
  const tally = new Map<string, number>();
  for (const raw of codes) {
    const c = raw?.trim().toUpperCase();
    if (!c) continue;
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  if (tally.size === 0) return null;
  return [...tally.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0][0];
}

export function resolveTripCurrency(
  explicit: string | null,
  codes: Array<string | null>,
): string {
  return explicit ?? inferCurrency(codes) ?? DEFAULT_CURRENCY;
}

// What a booking's cost is actually denominated in. A null/blank column means
// "whatever the trip is tracked in" — the state every legacy transport row is
// in, and the default for new bookings, so they follow the trip when its
// currency changes instead of being pinned to a code nobody typed.
export function effectiveCurrency(
  raw: string | null,
  tripCurrency: string,
): string {
  const c = raw?.trim().toUpperCase();
  return c ? c : tripCurrency;
}
