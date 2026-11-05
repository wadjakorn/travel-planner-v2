import 'server-only';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import type { TripBudgetConfig } from '@/db/schema';
import { parseISODate, expectedDayCount } from '@/lib/seed-days';
import type { LegWarningCode } from '@/lib/api/leg-warnings';

// Canonical warning taxonomy for the v1 import API.
//
// Subsumes the per-place link codes already emitted by `lib/api/place-link.ts`
// (do NOT fork the taxonomy — keep these snake_case, never SCREAMING_CASE) and
// adds the trip-level semantic rules used by dryRun + the real import (TP-0041).
// `PlaceLinkWarning` objects ({ code, message }) are assignable to
// `ImportWarning` because `path` is optional.
export type ImportWarningCode =
  // Existing place-link codes (see lib/api/place-link.ts).
  | 'url_unsupported'
  | 'url_unresolved'
  | 'coords_approx'
  | 'coords_mismatch'
  | 'lookup_skipped'
  // Semantic trip-level rules (TP-0041).
  | 'night_without_hotel'
  | 'place_without_coords'
  | 'flight_without_time'
  | 'place_unresolved'
  | 'over_budget'
  | 'budget_currency_mismatch'
  // Hotel codes (TP-0143).
  | 'hotel_without_location'
  | 'hotel_without_dates'
  // Transport codes (TP-0142).
  | 'transport_without_day'
  | 'iata_code_invalid'
  // Leg codes (TP-0141, see lib/api/leg-warnings.ts).
  | LegWarningCode;

export type ImportWarning = {
  code: ImportWarningCode;
  // 0-based JSON pointer to the offending node in the import plan, when known.
  // After finalizeImportWarnings it is the entity root (/days/0/places/3,
  // /hotels/1, /transport/2, /days/0, /budget).
  path?: string;
  message: string;
  // Name of the place / hotel / ride the warning is about.
  name?: string;
  // Every code merged into this entry, first = `code` (TP-0144).
  codes?: ImportWarningCode[];
  // The original warnings, with exact sub-paths; only when more than one merged.
  details?: { code: ImportWarningCode; path?: string; message: string }[];
  // Deprecated 1-based locators from place-link; use `path`.
  day?: number;
  place?: number;
};

const MESSAGES = {
  night_without_hotel: 'This day has no hotel booking covering the night.',
  place_without_coords: 'Place has no coordinates; it will not appear on the map.',
  flight_without_time: 'Transport/flight leg has no time; it cannot be ordered in the day.',
  over_budget: 'Estimated cost exceeds the trip budget.',
  hotel_without_location:
    'Hotel has no coordinates; it has no map pin and its legs are not drawn. Send area, address, query, googleMapsUrl or lat/lng.',
  hotel_without_dates:
    'This tbd hotel has no checkInDate/checkOutDate; it will not appear on any itinerary day.',
  transport_without_day:
    'This ride has no dayIdx or fromDate; it will not appear on any itinerary day.',
  iata_code_invalid: 'should be a 3-letter IATA code (e.g. KIX); it is stored as sent.',
  budget_currency_mismatch: 'cost rows in a currency other than the budget currency',
} as const;

// ---------------------------------------------------------------------------
// Date helpers (nights coverage). Mirrors import-service's effectiveDate: an
// explicit day.date, else startDate + i days, else null.

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayIso(dayDate: string | null, startDate: string | null, i: number): string | null {
  if (dayDate) return dayDate;
  if (!startDate) return null;
  const s = parseISODate(startDate);
  if (!s) return null;
  const d = new Date(s);
  d.setDate(d.getDate() + i);
  return toIso(d);
}

// The set of nights (ISO dates) a hotel covers: [checkInDate, checkOutDate).
// The checkout date is NOT a night. Falls back to `nights` when checkOut is
// absent. Returns an empty list when the stay has no resolvable dates.
function hotelNights(hotel: Record<string, unknown>): string[] {
  const checkIn = typeof hotel.checkInDate === 'string' ? hotel.checkInDate : null;
  if (!checkIn) return [];
  const start = parseISODate(checkIn);
  if (!start) return [];

  let count: number | null = null;
  const checkOut = typeof hotel.checkOutDate === 'string' ? hotel.checkOutDate : null;
  if (checkOut) {
    const end = parseISODate(checkOut);
    if (end) count = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  }
  if (count === null && typeof hotel.nights === 'number' && Number.isInteger(hotel.nights)) {
    count = hotel.nights;
  }
  if (count === null) count = 1; // a dated stay with no length is at least one night
  if (count <= 0) return [];

  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    const d = new Date(start);
    d.setDate(d.getDate() + k);
    out.push(toIso(d));
  }
  return out;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Per-hotel warnings, shared by import (path '/hotels/<i>') and REST (no path).
// A tbd hotel needs both dates to land on an itinerary day (splitHotelsForDay).
export function hotelWarnings(h: Record<string, unknown>, path?: string): ImportWarning[] {
  const out: ImportWarning[] = [];
  const at = path === undefined ? {} : { path };
  if (h.lat == null || h.lng == null) {
    out.push({ code: 'hotel_without_location', ...at, message: MESSAGES.hotel_without_location });
  }
  if (h.status === 'tbd' && (!h.checkInDate || !h.checkOutDate)) {
    out.push({ code: 'hotel_without_dates', ...at, message: MESSAGES.hotel_without_dates });
  }
  return out;
}

// Per-ride warnings, shared by import (path '/transport/<i>') and REST (no path).
// `dayDates` (import only): the plan's day ISO dates; a fromDate outside them
// lands on no day. Omit to check only for an empty fromDate.
export function transportWarnings(
  t: Record<string, unknown>,
  path?: string,
  dayDates?: Set<string>,
): ImportWarning[] {
  const out: ImportWarning[] = [];
  const at = path === undefined ? {} : { path };
  const fromDate = typeof t.fromDate === 'string' && t.fromDate ? t.fromDate : null;
  if (t.dayIdx == null && (!fromDate || (dayDates && !dayDates.has(fromDate)))) {
    out.push({ code: 'transport_without_day', ...at, message: MESSAGES.transport_without_day });
  }
  if (t.type === 'flight') {
    for (const key of ['fromCode', 'toCode'] as const) {
      const v = t[key];
      if (typeof v !== 'string') continue;
      const code = v.trim();
      if (code && !/^[A-Z]{3}$/.test(code)) {
        out.push({
          code: 'iata_code_invalid',
          ...(path === undefined ? {} : { path: `${path}/${key}` }),
          message: `Flight ${key} ${MESSAGES.iata_code_invalid}`,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule runner. One module so import + dryRun + (future UI) share one source of
// truth; callers pass the parsed + link-resolved plan.
//
// NOTE on `place_unresolved`: it is emitted by place-link (a `query` with no
// match), not here. finalizeImportWarnings folds the place_without_coords this
// runner adds for the same place into that entry.
export function collectTripWarnings(plan: ParsedImportPlan): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  const days = plan?.days ?? [];
  const hotels = plan?.hotels ?? [];
  const startDate = plan?.trip?.startDate ?? null;

  // night_without_hotel — considers only explicitly-provided days (not the
  // date-range skeleton importPlan seeds), so a bare dated trip with no
  // itinerary does not drown the agent in warnings. The final itinerary day is
  // a checkout morning (a hotel stay's [checkIn, checkOut) excludes it), so an
  // N-day/N-1-night trip legitimately has no hotel on its last day — evaluate
  // only days strictly before the final one.
  const covered = new Set<string>();
  let anyHotel = false;
  for (const h of hotels) {
    anyHotel = true;
    for (const night of hotelNights(h as Record<string, unknown>)) covered.add(night);
  }
  const lastDay = days.length - 1;
  days.forEach((d, i) => {
    if (i >= lastDay) return; // final/departure day is a checkout, not a night
    const iso = dayIso(d?.date ?? null, startDate, i);
    const uncovered = iso === null ? !anyHotel : !covered.has(iso);
    if (uncovered) {
      warnings.push({ code: 'night_without_hotel', path: `/days/${i}`, message: MESSAGES.night_without_hotel });
    }
  });

  // hotel_without_location / hotel_without_dates — per hotel (TP-0143).
  hotels.forEach((h, i) => {
    warnings.push(...hotelWarnings(h as Record<string, unknown>, `/hotels/${i}`));
  });

  // transport_without_day / iata_code_invalid — per ride (TP-0142). Day dates
  // follow the same day count rule as per_day budgeting; empty -> skip the
  // date check.
  const transport = plan?.sections?.transport ?? [];
  if (transport.length) {
    const dayCount = days.length || expectedDayCount(startDate, plan?.trip?.endDate ?? null);
    const dates = new Set<string>();
    for (let i = 0; i < dayCount; i++) {
      const iso = dayIso(days[i]?.date ?? null, startDate, i);
      if (iso) dates.add(iso);
    }
    transport.forEach((t, i) => {
      warnings.push(
        ...transportWarnings(t as unknown as Record<string, unknown>, `/transport/${i}`, dates.size ? dates : undefined),
      );
    });
  }

  // place_without_coords / flight_without_time — per place.
  days.forEach((d, i) => {
    (d?.places ?? []).forEach((p, j) => {
      const path = `/days/${i}/places/${j}`;
      if (p.kind === 'transit') {
        if (p.time == null) {
          warnings.push({ code: 'flight_without_time', path, message: MESSAGES.flight_without_time });
        }
      } else if (p.lat == null && p.lng == null) {
        warnings.push({ code: 'place_without_coords', path, message: MESSAGES.place_without_coords });
      }
    });
  });

  // over_budget — estimated spend vs the plan's budget section (TP-0042 persists
  // it to trip.budget_config). Only fires for a concrete numeric target; the
  // per_person basis is checked only when the plan gives budget.travelers. The budget
  // section is ParsedBudgetSection ({ config, currency }); the target lives on
  // `config`, not the section itself.
  const budget: TripBudgetConfig | null = plan?.sections?.budget?.config ?? null;
  const amount = num(budget?.amount);
  if (amount !== null && amount > 0) {
    // No conversion anywhere in the app (db/schema.ts trips.currency): only rows
    // in the budget currency are summed; explicit other-currency rows are
    // skipped and reported once. With no known budget currency (a fresh import
    // has no other trip currency to fall back on) every row is summed as before.
    const budgetCurrency = plan?.sections?.budget?.currency?.trim().toUpperCase() || null;
    const counts = (raw: unknown): boolean => {
      if (!budgetCurrency || typeof raw !== 'string' || !raw.trim()) return true;
      return raw.trim().toUpperCase() === budgetCurrency;
    };
    let estimate = 0;
    let skipped = 0;
    for (const h of hotels) {
      const rec = h as Record<string, unknown>;
      const cost = num(rec.costAmount);
      if (cost === null) continue;
      if (counts(rec.costCurrency)) estimate += cost;
      else skipped++;
    }
    for (const e of plan?.sections?.expenses ?? []) {
      const cost = num(e.values.amount);
      if (cost === null) continue;
      if (counts((e.values as Record<string, unknown>).currency)) estimate += cost;
      else skipped++;
    }
    if (skipped > 0) {
      warnings.push({
        code: 'budget_currency_mismatch',
        path: '/budget',
        message: `${skipped} ${MESSAGES.budget_currency_mismatch} (${budgetCurrency}) were not counted toward the budget; no currency conversion is applied.`,
      });
    }
    const basis = budget?.basis;
    let threshold: number | null = amount;
    if (basis === 'per_day') {
      // A date-range-only trip has no explicit days yet (importPlan seeds them),
      // so fall back to the expected count rather than scaling by zero.
      const dayCount = days.length || expectedDayCount(startDate, plan?.trip?.endDate ?? null);
      threshold = amount * Math.max(dayCount, 1);
    } else if (basis === 'per_person') {
      // Without an explicit budget.travelers the headcount is only known once
      // members join, so the check is skipped rather than guessed.
      const travelers = num(budget?.travelers);
      threshold = travelers !== null && travelers > 0 ? amount * travelers : null;
    }
    if (threshold !== null && estimate > threshold) {
      warnings.push({ code: 'over_budget', path: '/budget', message: MESSAGES.over_budget });
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Response shaping (TP-0144). One entry per entity (place / hotel / ride / day /
// budget) with a 0-based `path`, the entity `name`, and every code in `codes`.
// Runs once on the merged import warnings (hotel-link → place-link →
// transport-link → semantic → leg), so the first code of an entity is the root
// cause (place_unresolved / lookup_skipped before place_without_coords).

const ENTITY_ROOT = /^\/(?:days\/\d+\/places\/\d+|days\/\d+|hotels\/\d+|transport\/\d+|budget)(?=\/|$)/;

function entityRoot(path: string): string {
  return ENTITY_ROOT.exec(path)?.[0] ?? path;
}

function entityName(plan: ParsedImportPlan, root: string): string | undefined {
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  let m = /^\/days\/(\d+)\/places\/(\d+)$/.exec(root);
  if (m) return text(plan?.days?.[+m[1]]?.places?.[+m[2]]?.name);
  m = /^\/hotels\/(\d+)$/.exec(root);
  if (m) {
    const h = plan?.hotels?.[+m[1]] as Record<string, unknown> | undefined;
    return text(h?.name) ?? text(h?.area);
  }
  m = /^\/transport\/(\d+)$/.exec(root);
  if (m) return text((plan?.sections?.transport?.[+m[1]] as Record<string, unknown> | undefined)?.title);
  return undefined;
}

export function finalizeImportWarnings(raw: ImportWarning[], plan: ParsedImportPlan): ImportWarning[] {
  const groups = new Map<string, ImportWarning[]>();
  const out: (ImportWarning | string)[] = []; // string = group key placeholder
  for (const w of raw) {
    let path = w.path;
    if (path === undefined && w.day != null && w.place != null) {
      path = `/days/${w.day - 1}/places/${w.place - 1}`;
    }
    if (path === undefined) {
      out.push({ ...w, codes: [w.code] });
      continue;
    }
    const key = entityRoot(path);
    const g = groups.get(key);
    if (g) g.push({ ...w, path });
    else {
      groups.set(key, [{ ...w, path }]);
      out.push(key);
    }
  }
  return out.map((item) => {
    if (typeof item !== 'string') return item;
    const g = groups.get(item)!;
    const first = g[0];
    const entry: ImportWarning = {
      code: first.code,
      codes: [...new Set(g.map((w) => w.code))],
      path: item,
      message: first.message,
    };
    const name = g.find((w) => w.name)?.name ?? entityName(plan, item);
    if (name) entry.name = name;
    const loc = g.find((w) => w.day != null && w.place != null);
    if (loc) {
      entry.day = loc.day;
      entry.place = loc.place;
    }
    if (g.length > 1) {
      const seen = new Set<string>();
      entry.details = g
        .filter((w) => {
          const k = `${w.code} ${w.path}`;
          return seen.has(k) ? false : (seen.add(k), true);
        })
        .map((w) => ({ code: w.code, path: w.path, message: w.message }));
    }
    return entry;
  });
}

// `{ [code]: count }` over every code of every entry; entries without `codes`
// (markers persisted before TP-0144) count their `code`.
export function summarizeWarnings(warnings: ImportWarning[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const w of warnings) {
    for (const c of w.codes?.length ? w.codes : [w.code]) summary[c] = (summary[c] ?? 0) + 1;
  }
  return summary;
}
