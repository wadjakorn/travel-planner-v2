import 'server-only';
import type { ParsedImportPlan } from '@/lib/api/import-input';
import type { TripBudgetConfig } from '@/db/schema';
import { parseISODate } from '@/lib/seed-days';

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
  | 'over_budget';

export type ImportWarning = {
  code: ImportWarningCode;
  // JSON-pointer-ish path to the offending node in the import plan, when known.
  path?: string;
  message: string;
};

const MESSAGES = {
  night_without_hotel: 'This day has no hotel booking covering the night.',
  place_without_coords: 'Place has no coordinates; it will not appear on the map.',
  flight_without_time: 'Transport/flight leg has no time; it cannot be ordered in the day.',
  over_budget: 'Estimated cost exceeds the trip budget.',
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
  // itinerary does not drown the agent in warnings.
  const covered = new Set<string>();
  let anyHotel = false;
  for (const h of hotels) {
    anyHotel = true;
    for (const night of hotelNights(h as Record<string, unknown>)) covered.add(night);
  }
  days.forEach((d, i) => {
    const iso = dayIso(d?.date ?? null, startDate, i);
    const uncovered = iso === null ? !anyHotel : !covered.has(iso);
    if (uncovered) {
      warnings.push({ code: 'night_without_hotel', path: `/days/${i}`, message: MESSAGES.night_without_hotel });
    }
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
  // per_person basis is skipped (no traveler count in the plan).
  const budget = (plan?.sections?.budget as TripBudgetConfig | null) ?? null;
  const amount = num(budget?.amount);
  if (amount !== null && amount > 0) {
    let estimate = 0;
    for (const h of hotels) estimate += num((h as Record<string, unknown>).costAmount) ?? 0;
    for (const e of plan?.sections?.expenses ?? []) {
      estimate += num((e as Record<string, unknown>)?.amount) ?? 0;
    }
    const basis = budget?.basis;
    let threshold: number | null = amount;
    if (basis === 'per_day') threshold = amount * Math.max(days.length, 1);
    else if (basis === 'per_person') threshold = null; // unknown traveler count
    if (threshold !== null && estimate > threshold) {
      warnings.push({ code: 'over_budget', path: '/budget', message: MESSAGES.over_budget });
    }
  }

  return warnings;
}
