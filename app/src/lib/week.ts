// Which day a week starts on, and what the days are called — both derived
// from the active locale rather than hardcoded.
//
// The TP-0013 audit decided week start must NOT become its own setting: it is
// a property of the locale, and every locale already carries the answer.

import type { Lang } from '@/lib/i18n';

// Intl needs a region to answer weekInfo — a bare 'en' has no first day.
const LOCALES: Record<Lang, string> = { en: 'en-US', th: 'th-TH' };

export function localeTag(lang: Lang): string {
  return LOCALES[lang] ?? LOCALES.en;
}

type WeekInfoCapable = {
  getWeekInfo?: () => { firstDay: number };
  weekInfo?: { firstDay: number };
};

/**
 * First day of the week for `locale`, as a JS day index (0 = Sunday), matching
 * Date#getUTCDay. Intl reports 1 = Monday … 7 = Sunday, so 7 folds to 0.
 * Falls back to Sunday where the runtime has no weekInfo (older Firefox).
 */
export function weekStart(locale: string): number {
  const loc = new Intl.Locale(locale) as Intl.Locale & WeekInfoCapable;
  const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
  const firstDay = info?.firstDay;
  return typeof firstDay === 'number' ? firstDay % 7 : 0;
}

/**
 * Short weekday names for `locale`, indexed by JS day (0 = Sunday) so callers
 * can look one up straight from getUTCDay().
 */
export function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  // 2024-01-07 is a Sunday, so index 0 lands on Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(Date.UTC(2024, 0, 7 + i))),
  );
}

/** The same names in the order the locale's calendar columns run. */
export function weekdayHeader(locale: string): { dow: number; label: string }[] {
  const names = weekdayNames(locale);
  const start = weekStart(locale);
  return Array.from({ length: 7 }, (_, i) => {
    const dow = (start + i) % 7;
    return { dow, label: names[dow] };
  });
}
