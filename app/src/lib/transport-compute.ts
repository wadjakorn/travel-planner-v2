// Pure helpers for the intent-first transport form: derive a station/airport
// code from a place name, compute a timezone-aware arrival from a departure +
// duration, and build the display title. No DOM, no Google deps — unit-tested.

const TYPE_LABEL: Record<string, string> = {
  flight: 'Flight',
  train: 'Train',
  car: 'Car',
  ferry: 'Ferry',
};

// Words stripped from a place name to get a short, title-friendly label.
const NOISE = /\b(international|intl\.?|airport|station|terminal|ferry|rail(way)?|bus)\b/gi;

/** Pull a station/airport code from a place name.
 *  "Los Angeles International Airport (LAX)" → "LAX"; a bare "nrt" → "NRT";
 *  names with no code → null. */
export function deriveCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const paren = name.match(/\(([A-Za-z]{3})\)/);
  if (paren) return paren[1].toUpperCase();
  const trimmed = name.trim();
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

/** Short, title-friendly label for a place: drop the code and noise words.
 *  "Narita International Airport" → "Narita"; "Kyoto" → "Kyoto". */
export function shortPlaceLabel(name: string | null | undefined): string {
  if (!name) return '';
  const noParen = name.replace(/\s*\([^)]*\)\s*/g, ' ');
  const stripped = noParen.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  return stripped || noParen.trim();
}

/** Build the computed booking title: `<ref | Type> · From → To`. */
export function computeTitle(
  type: string,
  ref: string | null | undefined,
  fromLabel: string | null | undefined,
  toLabel: string | null | undefined,
): string {
  const prefix = (ref && ref.trim()) || TYPE_LABEL[type] || 'Trip';
  const body = [fromLabel, toLabel].filter((s) => s && s.trim()).join(' → ');
  return body ? `${prefix} · ${body}` : prefix;
}

function toEpochMin(dateISO: string, timeHHMM: string): number | null {
  const dm = dateISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = timeHHMM.match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const [, y, mo, d] = dm.map(Number) as unknown as number[];
  const [, hh, mm] = tm.map(Number) as unknown as number[];
  return Date.UTC(y, mo - 1, d, hh, mm) / 60000;
}

function dayDiff(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export type Arrival = {
  date: string; // YYYY-MM-DD, destination-local
  time: string; // HH:MM 24h, destination-local
  dayDelta: number; // calendar days after departure date (0 = same day)
  tzDeltaMinutes: number; // destination offset − origin offset
};

/** Compute destination-local arrival from an origin-local departure, a duration,
 *  and each end's UTC offset (minutes). Returns null when inputs are incomplete
 *  (e.g. a place with no known offset). */
export function computeArrival(input: {
  departDate: string | null | undefined;
  departTime: string | null | undefined;
  durationMinutes: number | null | undefined;
  fromOffsetMinutes: number | null | undefined;
  toOffsetMinutes: number | null | undefined;
}): Arrival | null {
  const { departDate, departTime, durationMinutes, fromOffsetMinutes, toOffsetMinutes } = input;
  if (!departDate || !departTime || durationMinutes == null) return null;
  if (fromOffsetMinutes == null || toOffsetMinutes == null) return null;

  const departWall = toEpochMin(departDate, departTime);
  if (departWall == null) return null;

  const departUtc = departWall - fromOffsetMinutes;
  const arrivalUtc = departUtc + durationMinutes;
  const arrivalWall = arrivalUtc + toOffsetMinutes;

  const dt = new Date(arrivalWall * 60000); // UTC fields hold destination wall clock
  const date = dt.toISOString().slice(0, 10);
  const time = dt.toISOString().slice(11, 16);
  return {
    date,
    time,
    dayDelta: dayDiff(departDate, date),
    tzDeltaMinutes: toOffsetMinutes - fromOffsetMinutes,
  };
}

/** "next day · +16h" style badge text for an arrival, or null when nothing
 *  noteworthy (same day, no TZ shift). */
export function arrivalBadge(a: Arrival | null): string | null {
  if (!a) return null;
  const parts: string[] = [];
  if (a.dayDelta === 1) parts.push('next day');
  else if (a.dayDelta > 1) parts.push(`+${a.dayDelta} days`);
  else if (a.dayDelta < 0) parts.push(`${a.dayDelta} day`);
  if (a.tzDeltaMinutes !== 0) {
    const h = a.tzDeltaMinutes / 60;
    const sign = h > 0 ? '+' : '−';
    const abs = Math.abs(h);
    const label = Number.isInteger(abs) ? `${abs}h` : `${abs.toFixed(1)}h`;
    parts.push(`${sign}${label} TZ`);
  }
  return parts.length ? parts.join(' · ') : null;
}
