// RFC 5545 iCalendar writer.
//
// Pure string work, no DB import — the data loading lives in
// `@/lib/ics-queries`. Kept dependency-free on purpose: the project has no ics
// package and the subset we emit (VEVENT with all-day or floating local times)
// is small enough to own.

export type IcsAllDayEvent = {
  kind: 'all-day';
  uid: string;
  summary: string;
  location?: string | null;
  description?: string | null;
  /** First day, YYYY-MM-DD. */
  start: string;
  /** Last day the event occupies, INCLUSIVE, YYYY-MM-DD. Defaults to `start`. */
  lastDay?: string | null;
};

export type IcsTimedEvent = {
  kind: 'timed';
  uid: string;
  summary: string;
  location?: string | null;
  description?: string | null;
  /** YYYY-MM-DD */
  start: string;
  /** HH:MM, floating local time — no TZID, no VTIMEZONE. */
  startTime: string;
  end?: string | null;
  endTime?: string | null;
};

export type IcsEvent = IcsAllDayEvent | IcsTimedEvent;

const CRLF = '\r\n';

// Escape the TEXT value type: backslash first, then the separators, then
// newlines. Order matters — escaping `\` after `,` would double-escape.
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

// Fold at 75 OCTETS, not 75 characters. Thai place names are 3 bytes per
// character, so a character-based fold slices a codepoint in half and the file
// stops parsing. Continuation lines start with a single space (which itself
// counts toward the 75).
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;

  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (curBytes + chBytes > limit) {
      out.push(cur);
      cur = ' ';
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += chBytes;
  }
  if (cur) out.push(cur);
  return out.join(CRLF);
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function icsDateTime(iso: string, time: string): string {
  const [h, m] = time.split(':');
  return `${icsDate(iso)}T${h.padStart(2, '0')}${(m ?? '00').padStart(2, '0')}00`;
}

// Add whole days to an ISO date in UTC — no local-timezone DST drift.
// (Same arithmetic as calendar-queries' addDaysIso; duplicated here to keep
// this module free of any `@/db` transitive import.)
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// Parse the free-text time columns ("9:00 AM", "09:00", "21.30") into HH:MM.
// Anything we cannot read returns null and the caller falls back to all-day —
// a wrong time is worse than no time.
export function parseLooseTime(s: string | null | undefined): string | null {
  if (!s) return null;
  // Minutes require a separator: a bare "2026" is a year someone typed in the
  // wrong field, not 20:26. A lone hour ("9", "9 pm") is still accepted.
  const m = /^\s*(\d{1,2})\s*(?:[:.]\s*(\d{2}))?\s*(am|pm|AM|PM)?\s*$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  const ampm = m[3]?.toLowerCase();
  if (Number.isNaN(h) || Number.isNaN(min) || min > 59) return null;
  if (ampm) {
    if (h < 1 || h > 12) return null;
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function prop(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

function renderEvent(ev: IcsEvent, dtstamp: string): string[] {
  const lines: string[] = ['BEGIN:VEVENT'];
  lines.push(prop('UID', ev.uid));
  lines.push(prop('DTSTAMP', dtstamp));

  if (ev.kind === 'all-day') {
    // DTEND of an all-day VEVENT is EXCLUSIVE: a trip on 12–14 April ends
    // 20260415. Writing the last day here shows the event a day short in every
    // calendar app — the classic .ics bug.
    const last = ev.lastDay && ev.lastDay >= ev.start ? ev.lastDay : ev.start;
    lines.push(prop('DTSTART;VALUE=DATE', icsDate(ev.start)));
    lines.push(prop('DTEND;VALUE=DATE', icsDate(addDays(last, 1))));
  } else {
    lines.push(prop('DTSTART', icsDateTime(ev.start, ev.startTime)));
    const endDate = ev.end && ev.end >= ev.start ? ev.end : ev.start;
    const endTime = ev.endTime ?? ev.startTime;
    const start = icsDateTime(ev.start, ev.startTime);
    let end = icsDateTime(endDate, endTime);
    // An end at or before the start is a zero/negative duration, which clients
    // render inconsistently. Give it an hour — rolling into the next day when
    // the start is late enough, so a 23:30 event still gets a real duration.
    if (end <= start) {
      const [d, t] = plusHour(ev.start, ev.startTime);
      end = icsDateTime(d, t);
    }
    lines.push(prop('DTEND', end));
  }

  lines.push(prop('SUMMARY', escapeText(ev.summary)));
  if (ev.location) lines.push(prop('LOCATION', escapeText(ev.location)));
  if (ev.description) lines.push(prop('DESCRIPTION', escapeText(ev.description)));
  lines.push('END:VEVENT');
  return lines;
}

// One hour later, as [date, HH:MM] — 23:30 on the 12th becomes 00:30 on the 13th.
function plusHour(iso: string, time: string): [string, string] {
  const [h, m] = time.split(':').map(Number);
  const nextH = h + 1;
  return nextH > 23
    ? [addDays(iso, 1), `00:${String(m).padStart(2, '0')}`]
    : [iso, `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`];
}

export function buildIcs(
  calendarName: string,
  events: IcsEvent[],
  dtstamp: string,
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//travel-planner-v2//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    prop('X-WR-CALNAME', escapeText(calendarName)),
  ];
  for (const ev of events) lines.push(...renderEvent(ev, dtstamp));
  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}

// UTC timestamp in the basic format DTSTAMP requires.
export function icsStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}
