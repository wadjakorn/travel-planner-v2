// Validation for the top-level plan sections of the /api/v1/trips/import body
// (transport / expenses / notes / budget). Wave-1 (TP-0040) makes these REAL:
// each item is validated here with the SAME pure validator the single-entity
// create path uses (so bad shapes are rejected identically), and import-service
// persists the result in the import transaction. Nothing is persisted here.
//
// Bad shape → ServiceError('bad_request'); the route maps it to 400 and (because
// importPlan runs in a transaction) nothing is written.

import { ServiceError } from '@/lib/services/service-error';
import { parseTransportInput } from '@/lib/services/booking-service';
import { parseExpenseInput } from '@/lib/services/expense-service';
import { parseNoteInput } from '@/lib/services/note-service';
import { parseBudgetConfigInput } from '@/lib/budget-config';
import { normalizeCurrency, CurrencyFormatError } from '@/lib/currency';
import type { TripBudgetConfig } from '@/db/schema';

export type ImportSectionKey = 'transport' | 'expenses' | 'notes' | 'budget';

// Per-section payload caps, matching the MAX_DAYS/MAX_PLACES_PER_DAY pattern in
// import-input.ts: one request can't create an unbounded plan.
export const MAX_TRANSPORT = 100;
export const MAX_EXPENSES = 500;
export const MAX_NOTES = 100;

export type ParsedTransport = ReturnType<typeof parseTransportInput>;
export type ParsedExpense = ReturnType<typeof parseExpenseInput>;
export type ParsedNote = ReturnType<typeof parseNoteInput>;

// The budget section carries the trip's budget config plus (optionally) the
// comparison currency, which lives on its own trip column (trips.currency).
export type ParsedBudgetSection = {
  config: TripBudgetConfig | null;
  currency: string | null;
};

// The parsed, validated sections surfaced on ParsedImportPlan. import-service
// inserts these as-is (they are already known-good here).
export type ParsedSections = {
  transport: ParsedTransport[];
  expenses: ParsedExpense[];
  notes: ParsedNote[];
  budget: ParsedBudgetSection | null;
};

function parseArraySection<T>(
  v: unknown,
  label: string,
  max: number,
  parseItem: (o: Record<string, unknown>) => T,
): T[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    throw new ServiceError('bad_request', `"${label}" must be an array`);
  }
  if (v.length > max) {
    throw new ServiceError('bad_request', `"${label}" exceeds the limit of ${max}`);
  }
  return v.map((item, i) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ServiceError('bad_request', `${label} ${i + 1} must be an object`);
    }
    try {
      return parseItem(item as Record<string, unknown>);
    } catch (e) {
      if (e instanceof ServiceError) {
        throw new ServiceError('bad_request', `${label} ${i + 1}: ${e.message}`);
      }
      throw e;
    }
  });
}

function parseBudgetSection(v: unknown): ParsedBudgetSection | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new ServiceError('bad_request', '"budget" must be an object');
  }
  const o = v as Record<string, unknown>;
  const config = parseBudgetConfigInput(o);

  let currency: string | null = null;
  try {
    currency = normalizeCurrency(o.currency);
  } catch (e) {
    if (e instanceof CurrencyFormatError) {
      throw new ServiceError(
        'bad_request',
        '"budget.currency" must be a 3-letter currency code (e.g. "USD")',
      );
    }
    throw e;
  }

  if (config === null && currency === null) return null;
  return { config, currency };
}

export function parseSections(body: Record<string, unknown>): ParsedSections {
  return {
    transport: parseArraySection(body.transport, 'transport', MAX_TRANSPORT, parseTransportInput),
    expenses: parseArraySection(body.expenses, 'expenses', MAX_EXPENSES, parseExpenseInput),
    notes: parseArraySection(body.notes, 'notes', MAX_NOTES, parseNoteInput),
    budget: parseBudgetSection(body.budget),
  };
}
