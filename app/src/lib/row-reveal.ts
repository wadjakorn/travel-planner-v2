// A tap on a list row asks for its actions to be brought into view once the row
// has expanded (and the row that was open above it has collapsed). Only a
// user's touch tap asks: URL, map and back-navigation selections never do.

let pending: { id: string; at: number } | null = null;
let lastTouchSelect = -Infinity;

/** A tap's synthesized click arrives right after pointerup. By then the row above may have collapsed and the
 *  tapped row's actions may sit under the finger: that click must not press them. */
export function isGhostClick(): boolean {
  return performance.now() - lastTouchSelect < 150;
}

export function markTouchTap() {
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) lastTouchSelect = performance.now();
}

export function requestReveal(id: string) {
  if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) return;
  pending = { id, at: performance.now() };
}

/** True once per request, and only while it is fresh (a stale one must not fire on a later selection). */
export function takeReveal(id: string): boolean {
  const p = pending;
  if (!p || p.id !== id) return false;
  pending = null;
  return performance.now() - p.at < 3000;
}

function scroller(el: Element): HTMLElement | null {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null; // the window
}

/** Scroll just far enough that the row's top and its last action are in view, clear of fixed chrome. */
export function revealRow(row: HTMLElement) {
  const bottomChrome = [...document.querySelectorAll<HTMLElement>('[data-trip-nav], [data-map-toggle]')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0 && r.top > window.innerHeight / 2)
    .reduce((m, r) => Math.max(m, window.innerHeight - r.top), 0);
  const topChrome = [...document.querySelectorAll<HTMLElement>('header')]
    .filter((el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position))
    .reduce((m, el) => Math.max(m, el.getBoundingClientRect().bottom), 0);
  const box = scroller(row);
  const view = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const visibleTop = Math.max(view.top, 0) + topChrome + 8;
  const visibleBottom = Math.min(view.bottom, window.innerHeight) - bottomChrome - 8;
  const r = row.getBoundingClientRect();
  const down = r.bottom - visibleBottom; // > 0: the actions are below the visible area, scroll at least this far
  const up = r.top - visibleTop; // < 0: the row's top is above it, scroll at most this far (negative = back up)
  // Show both when they fit. When the row is taller than the visible area, the actions win: they are why the user tapped.
  const by = down > up ? down : Math.min(Math.max(0, down), up);
  if (Math.abs(by) < 1) return;
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  (box ?? window).scrollBy({ top: by, behavior });
}
