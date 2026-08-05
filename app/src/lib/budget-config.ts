// Parsing for the budget-settings form. Pure — no DB, no auth — so the rules
// below can be unit-tested directly; the server action just calls it.

import { EXPENSE_CATEGORIES } from '@/db/schema';
import type { BudgetBasis, ExpenseCategory, TripBudgetConfig } from '@/db/schema';
import { parseNumber } from '@/lib/form-parsers';

const BASES: BudgetBasis[] = ['total', 'per_person', 'per_day'];

export function parseBasis(v: FormDataEntryValue | null): BudgetBasis {
  if (typeof v === 'string' && (BASES as string[]).includes(v)) {
    return v as BudgetBasis;
  }
  throw new Error('Invalid budget basis');
}

// jsonb enforces nothing, so cap keys are checked against the enum here or not
// at all. A cap stored under "hotel" instead of "hotels" would be accepted by
// Postgres, apply to nothing, and give the user no way to tell.
export function parseCaps(formData: FormData): TripBudgetConfig['caps'] {
  const caps: Partial<Record<ExpenseCategory, number>> = {};
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith('cap_')) continue;
    const category = key.slice(4);
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
      throw new Error(`Unknown budget category "${category}"`);
    }
    const amount = parseNumber(raw);
    if (amount === null) continue; // blank field = no cap
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Invalid cap for "${category}"`);
    }
    caps[category as ExpenseCategory] = amount;
  }
  return Object.keys(caps).length > 0 ? caps : undefined;
}

// The overall target and the per-category caps are independent settings that
// happen to share a form. Caps must survive a blank amount ("Leave blank for
// no budget" is a supported choice, not a mistake), and the stored config is
// cleared only when neither is set.
export function parseBudgetConfig(formData: FormData): TripBudgetConfig | null {
  const amount = parseNumber(formData.get('amount'));
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    throw new Error('Budget amount must be a positive number');
  }
  const caps = parseCaps(formData);
  const target = amount === null || amount === 0 ? null : amount;
  if (target === null && caps === undefined) return null;
  return { amount: target, basis: parseBasis(formData.get('basis')), caps };
}
