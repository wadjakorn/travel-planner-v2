import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  escapeText,
  foldLine,
  icsStamp,
  parseLooseTime,
  type IcsEvent,
} from './ics';

const STAMP = '20260101T000000Z';

function lines(ics: string): string[] {
  return ics.split('\r\n');
}

// Undo folding so a value can be asserted as one string.
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '');
}

describe('escapeText', () => {
  it('escapes the RFC 5545 specials', () => {
    expect(escapeText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
  });

  it('turns newlines into \\n', () => {
    expect(escapeText('one\ntwo\r\nthree')).toBe('one\\ntwo\\nthree');
  });

  it('escapes the backslash before the separators, not after', () => {
    expect(escapeText('\\,')).toBe('\\\\\\,');
  });
});

describe('foldLine', () => {
  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:hi')).toBe('SUMMARY:hi');
  });

  it('folds at 75 OCTETS and never splits a Thai character', () => {
    const thai = 'เที่ยวญี่ปุ่นหน้าซากุระกับครอบครัวและเพื่อนสนิททั้งหมด';
    const folded = foldLine(`SUMMARY:${thai}`);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    }
    // Round-trips: no codepoint was cut in half.
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(
      `SUMMARY:${thai}`,
    );
  });

  it('starts every continuation line with a single space', () => {
    const parts = foldLine('SUMMARY:' + 'a'.repeat(200)).split('\r\n');
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true);
  });
});

describe('parseLooseTime', () => {
  it.each([
    ['9:00 AM', '09:00'],
    ['09:00', '09:00'],
    ['9.30', '09:30'],
    ['12:00 AM', '00:00'],
    ['12:00 PM', '12:00'],
    ['21:30', '21:30'],
  ])('parses %s', (input, expected) => {
    expect(parseLooseTime(input)).toBe(expected);
  });

  it('reads a bare hour but not a bare 4-digit number', () => {
    expect(parseLooseTime('9')).toBe('09:00');
    // "2026" in a time field is a year typed in the wrong box, not 20:26.
    expect(parseLooseTime('2026')).toBeNull();
  });

  it.each([null, '', 'morning', 'ตอนเช้า', '25:00', '9:75'])(
    'returns null for %s',
    (input) => {
      expect(parseLooseTime(input as string | null)).toBeNull();
    },
  );
});

describe('buildIcs — all-day DTEND is exclusive', () => {
  it('writes the day AFTER the last day of a span', () => {
    const ics = buildIcs(
      'Trip',
      [
        {
          kind: 'all-day',
          uid: 'u1',
          summary: 'Tokyo',
          start: '2026-04-12',
          lastDay: '2026-04-14',
        },
      ],
      STAMP,
    );
    expect(lines(ics)).toContain('DTSTART;VALUE=DATE:20260412');
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20260415');
  });

  it('writes start+1 for a single-day event', () => {
    const ics = buildIcs(
      'Trip',
      [{ kind: 'all-day', uid: 'u1', summary: 'Day 1', start: '2026-04-12' }],
      STAMP,
    );
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20260413');
  });

  it('rolls over a month boundary', () => {
    const ics = buildIcs(
      'Trip',
      [{ kind: 'all-day', uid: 'u1', summary: 'x', start: '2026-04-30' }],
      STAMP,
    );
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20260501');
  });

  it('ignores a lastDay before the start', () => {
    const ics = buildIcs(
      'Trip',
      [
        {
          kind: 'all-day',
          uid: 'u1',
          summary: 'x',
          start: '2026-04-12',
          lastDay: '2026-04-01',
        },
      ],
      STAMP,
    );
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20260413');
  });
});

describe('buildIcs — timed events', () => {
  it('emits floating local time with no TZID', () => {
    const ics = buildIcs(
      'Trip',
      [
        {
          kind: 'timed',
          uid: 'u1',
          summary: 'NRT → HND',
          start: '2026-04-12',
          startTime: '09:05',
          end: '2026-04-12',
          endTime: '11:20',
        },
      ],
      STAMP,
    );
    expect(lines(ics)).toContain('DTSTART:20260412T090500');
    expect(lines(ics)).toContain('DTEND:20260412T112000');
    expect(ics).not.toContain('TZID');
    expect(ics).not.toContain('VTIMEZONE');
  });

  it('gives an hour to an event whose end is not after its start', () => {
    const ics = buildIcs(
      'Trip',
      [
        {
          kind: 'timed',
          uid: 'u1',
          summary: 'x',
          start: '2026-04-12',
          startTime: '09:00',
        },
      ],
      STAMP,
    );
    expect(lines(ics)).toContain('DTEND:20260412T100000');
  });

  it('rolls a late-evening event into the next day instead of clamping', () => {
    const ics = buildIcs(
      'Trip',
      [
        {
          kind: 'timed',
          uid: 'u1',
          summary: 'Night bus',
          start: '2026-04-12',
          startTime: '23:30',
        },
      ],
      STAMP,
    );
    expect(lines(ics)).toContain('DTSTART:20260412T233000');
    expect(lines(ics)).toContain('DTEND:20260413T003000');
  });
});

describe('buildIcs — structure', () => {
  const events: IcsEvent[] = [
    {
      kind: 'all-day',
      uid: 'u1',
      summary: 'Lunch, dinner; snacks',
      location: 'Shibuya, Tokyo',
      start: '2026-04-12',
    },
  ];

  it('wraps events in a VCALENDAR and uses CRLF', () => {
    const ics = buildIcs('เที่ยวญี่ปุ่น', events, STAMP);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(lines(ics)).toContain('VERSION:2.0');
    expect(lines(ics)).toContain('BEGIN:VEVENT');
    expect(lines(ics)).toContain('END:VEVENT');
    expect(lines(ics)).toContain(`DTSTAMP:${STAMP}`);
  });

  it('escapes commas and semicolons in SUMMARY and LOCATION', () => {
    const ics = unfold(buildIcs('Trip', events, STAMP));
    expect(ics).toContain('SUMMARY:Lunch\\, dinner\\; snacks');
    expect(ics).toContain('LOCATION:Shibuya\\, Tokyo');
  });

  it('keeps a long Thai trip name valid: folded, escaped, round-trippable', () => {
    const name = 'ทริปโตเกียว, โอซาก้า; เกียวโต ' + 'ฤดูใบไม้ผลิ'.repeat(6);
    const ics = buildIcs(name, [], STAMP);
    for (const l of lines(ics)) {
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    }
    expect(unfold(ics)).toContain(`X-WR-CALNAME:${escapeText(name)}`);
  });

  it('emits an empty but valid calendar when there are no events', () => {
    const ics = buildIcs('Trip', [], STAMP);
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('icsStamp', () => {
  it('formats UTC in the basic format', () => {
    expect(icsStamp(new Date('2026-08-05T09:07:03.123Z'))).toBe('20260805T090703Z');
  });
});
