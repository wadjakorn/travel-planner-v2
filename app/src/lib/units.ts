// Distance + temperature unit conversion. Mockup data is metric;
// real-app stores km and converts at the surface.

export type Units = 'metric' | 'imperial';

const KM_PER_MI = 1.60934;

const FT_PER_M = 3.28084;
// Below this, miles read as "0.1 mi" for everything — feet are more useful.
const FEET_UNDER_M = 500;

/**
 * Reformat a metric distance string ("8.4 km", "350 m") into the requested
 * units. Idempotent for non-parseable input — falls through unchanged, so a
 * value that is already imperial or has no unit survives a second pass.
 */
export function formatDistance(raw: string | null, units: Units): string {
  if (!raw) return '';
  if (units === 'metric') return raw;
  const m = /^(\d+(?:\.\d+)?)\s*(km|m)\b/.exec(raw);
  if (!m) return raw;
  const value = Number(m[1]);
  const metres = m[2] === 'km' ? value * 1000 : value;
  // "8.4 km" → "5.2 mi"; "350 m" → "1150 ft"
  const out =
    metres < FEET_UNDER_M
      ? `${Math.round(metres * FT_PER_M)} ft`
      : `${(metres / 1000 / KM_PER_MI).toFixed(1)} mi`;
  return raw.replace(m[0], out);
}
