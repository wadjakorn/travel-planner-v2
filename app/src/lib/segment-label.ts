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
