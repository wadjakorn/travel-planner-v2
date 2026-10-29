// Map "Search places" button / `/` key → the active day's search box in the
// list. The day may be collapsed (its picker not mounted yet), so the request
// is both an event (open the day; focus an already-mounted picker) and a
// pending day id that a picker takes on mount.

export const DAY_SEARCH_EVENT = 'tp:day-search';

export type DaySearchDetail = { dayId: string };

let pending: string | null = null;

export function requestDaySearchFocus(dayId: string): void {
  pending = dayId;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DaySearchDetail>(DAY_SEARCH_EVENT, { detail: { dayId } }));
}

/** True once when focus was requested for this day; clears the request. */
export function takeDaySearchFocus(dayId: string): boolean {
  if (pending !== dayId) return false;
  pending = null;
  return true;
}

/** Focus is somewhere `/` types a character: leave the key alone. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t) return false;
  const el = t as { tagName?: string; isContentEditable?: boolean };
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true;
}
