import { describe, it, expect } from 'vitest';
import { legSecondLine, segmentTimeText } from './segment-label';
import { formatDurationMin } from './units';

const f = (d: string) => `~${d}`;

describe('segmentTimeText', () => {
  it('durationMin wins over time', () => {
    expect(segmentTimeText('1 hr', 40, f)).toBe(f(formatDurationMin(40)));
  });

  it('falls back to time, and hides 0', () => {
    expect(segmentTimeText('1 hr', null, f)).toBe('1 hr');
    expect(segmentTimeText('1 hr', undefined, f)).toBe('1 hr');
    expect(segmentTimeText('', 0, f)).toBe('');
    expect(segmentTimeText('1 hr', 0, f)).toBe('1 hr');
  });
});

describe('legSecondLine', () => {
  it('note wins', () => {
    expect(legSecondLine('rapi:t', 40, true)).toEqual({ kind: 'note', text: 'rapi:t' });
  });

  it('editors get an add prompt', () => {
    expect(legSecondLine('a\nb', 40, true)).toEqual({ kind: 'note', text: 'a' });
    expect(legSecondLine(null, null, true)).toEqual({ kind: 'add', key: 'leg_add_time_note' });
    expect(legSecondLine(null, 40, true)).toEqual({ kind: 'add', key: 'leg_add_note' });
    expect(legSecondLine('  ', 0, true)).toEqual({ kind: 'add', key: 'leg_add_time_note' });
  });

  it('viewers get nothing without a note', () => {
    expect(legSecondLine(null, 40, false)).toBeNull();
  });
});
