// Locale-aware date text that is not a one-line toLocaleDateString call.
// English keeps its pre-i18n output byte for byte (i18n P6); other languages
// go through Intl with localeTag(lang) (Gregorian years in Thai, Decision 2).

import type { Lang } from '@/lib/i18n-client';
import { localeTag, shortWeekday } from '@/lib/week';

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Home card range: "Jul 12–15, 2026", "Jul 30 – Aug 2, 2026",
 *  "Dec 30, 2026 – Jan 2, 2027"; Thai "12–15 ก.ค. 2026". */
export function formatTripRange(start: string | null | undefined, end: string | null | undefined, lang: Lang): string {
  if (!start) return '';
  if (lang !== 'en') {
    const tag = localeTag(lang);
    if (!end) return utc(start).toLocaleDateString(tag, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const f = new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return f.formatRange(utc(start), utc(end));
  }
  const [sy, sm, sd] = start.split('-').map(Number);
  const startStr = `${MONTH_EN[sm - 1]} ${sd}`;
  if (!end) return startStr;
  const [ey, em, ed] = end.split('-').map(Number);
  const endStr = `${MONTH_EN[em - 1]} ${ed}, ${ey}`;
  if (sy !== ey) return `${startStr}, ${sy} – ${endStr}`;
  if (sm !== em) return `${startStr} – ${endStr}`;
  return `${startStr}–${ed}, ${ey}`;
}

/** A trip day's weekday chip ("Sat") and long date ("Saturday, April 12").
 *  Both are stored on the day row in English (lib/services/day-service.ts),
 *  so English shows them as stored; other languages format the day's ISO date
 *  and fall back to the stored text when the day has none. */
export function dayDisplay(
  stored: { label: string; date: string },
  iso: string | null | undefined,
  lang: Lang,
): { label: string; date: string } {
  if (lang === 'en' || !iso || Number.isNaN(utc(iso).getTime())) return { label: stored.label, date: stored.date };
  const tag = localeTag(lang);
  const d = utc(iso);
  return {
    label: d.toLocaleDateString(tag, { weekday: shortWeekday(tag), timeZone: 'UTC' }),
    date: d.toLocaleDateString(tag, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }),
  };
}
