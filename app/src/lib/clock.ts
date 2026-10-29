// One display format for clock times on the itinerary (place times, stay
// check-in/out, rides, pins). Stored values are free text ("3:00 PM", "15:00",
// "Morning"), so anything that isn't a clear clock time is shown as typed.

export type ClockLang = 'en' | 'th';

const TWELVE = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap])\.?\s*m?\.?$/i;
const TWENTY_FOUR = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/** `en` → `h:mm AM|PM`, `th` → `HH:mm`. Built by hand, not with `Intl`:
 *  Node's ICU puts U+202F before AM/PM. Empty → null; unparseable → trimmed input. */
export function formatClock(raw: string | null | undefined, lang: ClockLang): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const s = text.replace(/\s*น\.$/, '');

  let h: number;
  let m: number;
  const a = TWELVE.exec(s);
  const b = a ? null : TWENTY_FOUR.exec(s);
  if (a) {
    h = Number(a[1]);
    m = a[2] ? Number(a[2]) : 0;
    if (h < 1 || h > 12 || m > 59) return text;
    const pm = a[3].toLowerCase() === 'p';
    h = (h % 12) + (pm ? 12 : 0);
  } else if (b) {
    h = Number(b[1]);
    m = Number(b[2]);
    if (h > 23 || m > 59) return text;
  } else {
    return text;
  }

  const mm = String(m).padStart(2, '0');
  if (lang === 'th') return `${String(h).padStart(2, '0')}:${mm}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}
