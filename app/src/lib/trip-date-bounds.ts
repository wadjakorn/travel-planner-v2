// Date bounds for booking date pickers, scoped to a trip's day range ± a few
// days. A booking usually falls inside the trip, but travel/check-in days can
// spill a little past either end, so we pad the range by PAD_DAYS. All values
// are ISO yyyy-mm-dd strings (matching how trip/booking dates are stored).

const PAD_DAYS = 3;

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export type DateBounds = {
  /** Earliest selectable date (trip start − PAD_DAYS). */
  min?: string;
  /** Latest selectable date (trip end + PAD_DAYS). */
  max?: string;
  /** Sensible default inside the range (trip start) for an empty picker. */
  fallback?: string;
};

/** Compute ±PAD_DAYS bounds + an in-range default from a trip's date range. */
export function tripDateBounds(
  startDate?: string | null,
  endDate?: string | null,
): DateBounds {
  const bounds: DateBounds = {};
  if (startDate) {
    bounds.min = shiftIso(startDate, -PAD_DAYS);
    bounds.fallback = startDate;
  }
  if (endDate) {
    bounds.max = shiftIso(endDate, PAD_DAYS);
  }
  return bounds;
}
