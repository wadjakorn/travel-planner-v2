import 'server-only';

// Canonical warning taxonomy for the v1 import API.
//
// Subsumes the per-place link codes already emitted by `lib/api/place-link.ts`
// (do NOT fork the taxonomy — keep these snake_case, never SCREAMING_CASE) and
// adds placeholders for the trip-level semantic rules filled in by the Wave-1
// dryRun ticket. `PlaceLinkWarning` objects ({ code, message }) are assignable
// to `ImportWarning` because `path` is optional.
export type ImportWarningCode =
  // Existing place-link codes (see lib/api/place-link.ts).
  | 'url_unsupported'
  | 'url_unresolved'
  | 'coords_approx'
  | 'coords_mismatch'
  | 'lookup_skipped'
  // Semantic rule placeholders — implemented in the Wave-1 dryRun ticket.
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

// Rule-runner skeleton. Rules are implemented in the Wave-1 dryRun ticket;
// for now this returns no warnings so callers can wire it up early.
export function collectTripWarnings(): ImportWarning[] {
  return [];
}
