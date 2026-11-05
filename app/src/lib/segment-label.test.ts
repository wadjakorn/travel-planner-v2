import { describe, it, expect } from 'vitest';
import { segmentTimeText } from './segment-label';
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
