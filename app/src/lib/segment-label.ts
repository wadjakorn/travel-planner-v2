// What the itinerary list's leg bar shows for travel time (pure, so it is
// unit-tested): the leg's own estimate wins over the old free-text `time`,
// and a 0-minute estimate is not shown.

import { formatDurationMin } from './units';

export function segmentTimeText(
  time: string,
  durationMin: number | null | undefined,
  approx: (d: string) => string,
): string {
  if (durationMin != null && durationMin > 0) return approx(formatDurationMin(durationMin));
  return time || '';
}

/** The leg bar's second line: the leg note, else (editors only) a prompt to add one. */
export type LegSecondLine =
  | { kind: 'note'; text: string }
  | { kind: 'add'; key: 'leg_add_time_note' | 'leg_add_note' }
  | null;

// Depends on canEdit only, never on the bar being disabled: the editor's list
// renders disabled before hydration and during a reorder, and the line must
// not appear/disappear (the list would jump).
export function legSecondLine(
  note: string | null | undefined,
  durationMin: number | null | undefined,
  canEdit: boolean,
): LegSecondLine {
  const text = note?.trim();
  if (text) return { kind: 'note', text };
  if (!canEdit) return null;
  return { kind: 'add', key: durationMin != null && durationMin > 0 ? 'leg_add_note' : 'leg_add_time_note' };
}
