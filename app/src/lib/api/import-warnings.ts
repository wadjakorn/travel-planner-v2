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
  // Leg codes (TP-0141, see lib/api/leg-warnings.ts).
  | LegWarningCode;

export type ImportWarning = {
  code: ImportWarningCode;
  // JSON-pointer-ish path to the offending node in the import plan, when known.
  path?: string;
  message: string;
  // Place name, when the warning is about one place (leg codes).
  name?: string;
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

// ---------------------------------------------------------------------------
// Rule runner. One module so import + dryRun + (future UI) share one source of
// truth; callers pass the parsed + link-resolved plan.
//
// NOTE on `place_unresolved`: it stays in the taxonomy but is NOT emitted here.
// A googleMapsUrl / address that fails to resolve is already reported by
// place-link (`url_unresolved` / `lookup_skipped`), and server-side `query`
// resolution (TP-0037) is not wired yet and never reaches this plan shape, so
// there is nothing semantically distinct to add (per the TP-0041 brief).
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
