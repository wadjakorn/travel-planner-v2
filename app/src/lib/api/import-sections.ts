// Passthrough placeholder sections for the /api/v1/trips/import body (P0-CONTRACT).
//
// These are the top-level plan sections Wave-1 will wire to real persistence
// (transport, expenses, notes → TP-0040; budget → TP-0042). For now they are
// ONLY accepted and minimally shape-checked — never persisted. Keeping them in
// a small registry means "add a section later" = add one entry below, not edit
// a large parser function.

import { ServiceError } from '@/lib/services/service-error';

export type ImportSectionKey = 'transport' | 'expenses' | 'notes' | 'budget';

// The parsed, not-yet-persisted sections surfaced on ParsedImportPlan.
export type ParsedSections = {
  transport: unknown[];
  expenses: unknown[];
  notes: unknown[];
  budget: Record<string, unknown> | null;
};

function arrSection(label: string) {
  return (v: unknown): unknown[] => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      throw new ServiceError('bad_request', `"${label}" must be an array`);
    }
    return v;
  };
}

function objSection(label: string) {
  return (v: unknown): Record<string, unknown> | null => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'object' || Array.isArray(v)) {
      throw new ServiceError('bad_request', `"${label}" must be an object`);
    }
    return v as Record<string, unknown>;
  };
}

// Registry: add a new passthrough section by appending one entry here.
export const IMPORT_SECTIONS: {
  readonly key: ImportSectionKey;
  readonly parse: (v: unknown) => unknown;
}[] = [
  { key: 'transport', parse: arrSection('transport') },
  { key: 'expenses', parse: arrSection('expenses') },
  { key: 'notes', parse: arrSection('notes') },
  { key: 'budget', parse: objSection('budget') },
];

export function parseSections(body: Record<string, unknown>): ParsedSections {
  const out: Record<string, unknown> = {};
  for (const s of IMPORT_SECTIONS) out[s.key] = s.parse(body[s.key]);
  return out as ParsedSections;
}
