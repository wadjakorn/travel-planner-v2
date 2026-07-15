// Formatting helpers shared by the Bookings cards. Pure, framework-agnostic.

/** Nights between check-in/check-out (date-only diff, non-negative). */
export function computeNights(ci: string | null, co: string | null): number {
  if (!ci || !co) return 0;
  const a = Date.parse(ci);
  const b = Date.parse(co);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 0;
}

/** "3 nights" / "1 night". */
export function nightsLabel(n: number): string {
  return `${n} ${n === 1 ? 'night' : 'nights'}`;
}

/** Format a cost as symbol + grouped integer (no decimals). */
export function formatCost(amount: number | null | undefined, currency = 'USD'): string {
  if (amount == null) return '';
  const symbol =
    currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'THB' ? '฿' : `${currency} `;
  return `${symbol}${Math.round(amount).toLocaleString('en-US')}`;
}

/** "Jul 12" from an ISO date string; passes through non-ISO input unchanged. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
