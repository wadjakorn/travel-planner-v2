// The list ↔ map hover link: one hovered (or keyboard-focused) stop at a time.
// An external store, not context, so each row subscribes to its own boolean and
// a pointer crossing re-renders only the rows whose highlight flips. Keyed by
// day: synthetic hotel rows share an id across days (lib/day-augment.ts).

export type HoverSource = 'list' | 'map';
export type PlaceHover = { dayId: string; placeId: string; source: HoverSource };

let hover: PlaceHover | null = null;
const listeners = new Set<() => void>();

export function getPlaceHover(): PlaceHover | null {
  return hover;
}

export function subscribePlaceHover(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function setPlaceHover(h: PlaceHover): void {
  if (hover?.dayId === h.dayId && hover.placeId === h.placeId && hover.source === h.source) return;
  hover = h;
  notify();
}

/** Clears only a hover this source set (and only for `placeId`, when given). */
export function clearPlaceHover(source: HoverSource, placeId?: string): void {
  if (!hover || hover.source !== source) return;
  if (placeId !== undefined && hover.placeId !== placeId) return;
  hover = null;
  notify();
}

export function hoverIdFor(
  h: PlaceHover | null,
  dayId: string | null | undefined,
  source: HoverSource,
): string | null {
  return h && dayId && h.dayId === dayId && h.source === source ? h.placeId : null;
}
