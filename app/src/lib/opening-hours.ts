// Opening hours for one trip day. `place.hours` is Google's weekdayDescriptions
// joined with '; ' (lib/places/google.ts) — "Saturday: 10:00 AM – 2:00 PM" —
// or the seed's legacy single "Today · …" line.

import type { ClockLang } from '@/lib/clock';

export type DayHours = { weekday: string; text: string; closed: boolean };

const LABEL: Record<ClockLang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  th: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
};
const EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function weekdayIndex(token: string): number {
  const t = token.trim().toLowerCase();
  const en = EN.indexOf(t);
  if (en >= 0) return en;
  return TH.indexOf(t.replace(/^วัน/, ''));
}

/** The hours line for `dayIso`'s weekday, or null when there is no date, no
 *  hours, or the text can't be placed on a weekday. */
export function hoursForDate(
  hours: string | null | undefined,
  dayIso: string | null,
  lang: ClockLang,
): DayHours | null {
  if (!hours || !dayIso) return null;
  const dow = new Date(`${dayIso}T00:00:00Z`).getUTCDay();
  if (Number.isNaN(dow)) return null;
  const weekday = LABEL[lang][dow];
  const lines = hours
    .replace(/[    ]/g, ' ')
    .split(/\s*;\s*/)
    .filter(Boolean);

  const make = (text: string): DayHours => ({
    weekday,
    text,
    closed: /^(closed|ปิด(ทำการ)?)$/i.test(text),
  });

  if (lines.length === 1) {
    const today = /^today\s*·\s*(.+)$/i.exec(lines[0]);
    if (today) return make(today[1].trim());
  }
  for (const line of lines) {
    const m = /^([^:：]+)[:：]\s*(.+)$/.exec(line);
    if (m && weekdayIndex(m[1]) === dow) return make(m[2].trim());
  }
  return null;
}
