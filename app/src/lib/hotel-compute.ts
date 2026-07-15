// hotel-compute — pure helpers for the intent-first hotel form. Derives nights
// from the check-in/out date span (and the inverse) so the form can auto-fill
// nights while dates stay the primary input. All date math is calendar-based
// (UTC midnight) to avoid DST/timezone drift. Sibling of transport-compute.ts.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Parse a strict YYYY-MM-DD string to a UTC-midnight epoch, or null. */
function parseDay(s: string | null | undefined): number | null {
  if (!s || !DATE_RE.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

/**
 * Whole nights between check-in and check-out.
 * null if either date is missing/malformed or check-out precedes check-in.
 */
export function computeNights(
  checkInDate: string | null | undefined,
  checkOutDate: string | null | undefined,
): number | null {
  const a = parseDay(checkInDate);
  const b = parseDay(checkOutDate);
  if (a === null || b === null) return null;
  const nights = Math.round((b - a) / DAY_MS);
  return nights < 0 ? null : nights;
}

/** Human label: "1 night" / "2 nights". Empty string for null. */
export function nightsLabel(nights: number | null): string {
  if (nights === null) return '';
  return `${nights} night${nights === 1 ? '' : 's'}`;
}

/**
 * Check-out date implied by a check-in date + nights (the inverse of
 * computeNights). null on missing/malformed input or negative nights.
 */
export function computeCheckOut(
  checkInDate: string | null | undefined,
  nights: number | null | undefined,
): string | null {
  const a = parseDay(checkInDate);
  if (a === null || nights === null || nights === undefined || nights < 0) return null;
  return new Date(a + nights * DAY_MS).toISOString().slice(0, 10);
}
