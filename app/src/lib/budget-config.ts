// Parsing for the budget-settings form. Pure — no DB, no auth — so the rules
// below can be unit-tested directly; the server action just calls it.

import { EXPENSE_CATEGORIES } from '@/db/schema';
import type { BudgetBasis, ExpenseCategory, TripBudgetConfig } from '@/db/schema';
import { parseNumber } from '@/lib/form-parsers';
import { ServiceError } from '@/lib/services/service-error';

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

// JSON-body counterpart to parseBudgetConfig, for the REST API (TP-0040): the
// trip PATCH `budget` field and the import `budget` section. Validates the
// {amount, basis, caps} shape and — crucially — checks every cap key against
// EXPENSE_CATEGORIES (jsonb enforces nothing, so a typo'd key would be stored
// silently and apply to nothing). Throws ServiceError('bad_request') so the API
// maps it to a 400. Returns null when neither an amount nor any cap is set.
export function parseBudgetConfigInput(input: unknown): TripBudgetConfig | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ServiceError('bad_request', '"budget" must be an object');
  }
  const o = input as Record<string, unknown>;

  let amount: number | null = null;
  if (o.amount !== undefined && o.amount !== null) {
    if (typeof o.amount !== 'number' || !Number.isFinite(o.amount) || o.amount < 0) {
      throw new ServiceError('bad_request', '"budget.amount" must be a non-negative number');
    }
    amount = o.amount === 0 ? null : o.amount;
  }

  let basis: BudgetBasis = 'total';
  if (o.basis !== undefined) {
    if (typeof o.basis !== 'string' || !(BASES as string[]).includes(o.basis)) {
      throw new ServiceError(
        'bad_request',
        '"budget.basis" must be one of: total, per_person, per_day',
      );
    }
    basis = o.basis as BudgetBasis;
  }

  const caps = parseCapsInput(o.caps);
  if (amount === null && caps === undefined) return null;
  return { amount, basis, caps };
}

function parseCapsInput(v: unknown): TripBudgetConfig['caps'] {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new ServiceError('bad_request', '"budget.caps" must be an object');
  }
  const caps: Partial<Record<ExpenseCategory, number>> = {};
  for (const [key, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(key)) {
      throw new ServiceError('bad_request', `Unknown budget category "${key}"`);
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
      throw new ServiceError('bad_request', `"budget.caps.${key}" must be a non-negative number`);
    }
    caps[key as ExpenseCategory] = raw;
  }
  return Object.keys(caps).length > 0 ? caps : undefined;
}
