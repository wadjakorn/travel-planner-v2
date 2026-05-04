// Distance + temperature unit conversion. Mockup data is metric;
// real-app stores km and converts at the surface.

export type Units = 'metric' | 'imperial';

const KM_PER_MI = 1.60934;

/**
 * Reformat a metric distance string ("8.4 km") into the requested units.
 * Idempotent for non-parseable input — falls through unchanged.
 */
export function formatDistance(raw: string | null, units: Units): string {
  if (!raw) return '';
  if (units === 'metric') return raw;
  // "8.4 km" → "5.2 mi"
  const m = /^(\d+(?:\.\d+)?)\s*km\b/.exec(raw);
  if (!m) return raw;
  const km = Number(m[1]);
  const mi = km / KM_PER_MI;
  return raw.replace(m[0], `${mi.toFixed(1)} mi`);
}
