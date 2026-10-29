import type { Translate, TranslatePlural } from './i18n-client';
import type { Pin } from './map-helpers';
import { stopName } from './map-pin';

// Screen-reader text for the trip map (a11y-batch): the map is a canvas, so
// the shown day's stops are also given as a sentence the region is described
// by. The distance/time pills' spoken label is the `map_travel_total_aria` key.

/** "Day 1 · Sat 12 has 2 places: 1. Senso-ji, 09:00; 2. Tsuta Ramen, 19:30." */
export function mapSummary(dayLabel: string, pins: Pin[], t: Translate, tp: TranslatePlural): string {
  if (pins.length === 0) return t('map_summary_empty', { day: dayLabel });
  // Pin.idx is the list number (may have gaps); keep it so the text matches the list.
  const items = [...pins]
    .sort((a, b) => a.idx - b.idx)
    .map((p) => `${p.idx}. ${stopName(p, t)}${p.time ? `, ${p.time}` : ''}`);
  return tp('map_summary', pins.length, { day: dayLabel, items: items.join('; ') });
}
