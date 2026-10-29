// Formatting helpers shared by the Bookings cards. Pure, framework-agnostic.

import type { MessageKey } from '@/lib/i18n-client';

/** Nights between check-in/check-out (date-only diff, non-negative). */
export function computeNights(ci: string | null, co: string | null): number {
  if (!ci || !co) return 0;
  const a = Date.parse(ci);
  const b = Date.parse(co);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 0;
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

export type BookingFilter = 'all' | 'stay' | 'move';

/** Empty-state copy (message keys) for the Bookings list, aware of the active
 *  filter. Transport has no coordinates, so its copy never mentions the map. */
export function bookingsEmptyKeys(filter: BookingFilter): { title: MessageKey; body: MessageKey } {
  if (filter === 'stay') return { title: 'booking_empty_stay_title', body: 'booking_empty_stay_body' };
  if (filter === 'move') return { title: 'booking_empty_move_title', body: 'booking_empty_move_body' };
  return { title: 'booking_empty_all_title', body: 'booking_empty_all_body' };
}
