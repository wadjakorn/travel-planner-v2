import type { Pin } from './map-helpers';

// Screen-reader text for the trip map (a11y-batch): the map is a canvas, so
// the shown day's stops are also given as a sentence the region is described
// by, and the distance/time pills get one spoken label.

/** "Day 1 · Sat 12 has 2 places: 1. Senso-ji, 09:00; 2. Tsuta Ramen, 19:30." */
export function mapSummary(dayLabel: string, pins: Pin[]): string {
  if (pins.length === 0) return `${dayLabel} has no places yet.`;
  // Pin.idx is the list number (may have gaps); keep it so the text matches the list.
  const items = [...pins]
    .sort((a, b) => a.idx - b.idx)
    .map((p) => `${p.idx}. ${p.name ?? `Stop ${p.idx}`}${p.time ? `, ${p.time}` : ''}`);
  const count = `${pins.length} ${pins.length === 1 ? 'place' : 'places'}`;
  return `${dayLabel} has ${count}: ${items.join('; ')}.`;
}

/** Spoken label for the bottom-left distance + time pills. */
export function travelChipLabel(distance: string, time: string): string {
  return `Total travel for this day: ${distance}, ${time}`;
}
