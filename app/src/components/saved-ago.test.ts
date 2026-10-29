import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import { makeT } from '@/lib/i18n-client';
import { formatAgo } from './saved-ago';

// The pre-i18n formatter, verbatim: English must not change.
function legacy(ms: number): string {
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

describe('formatAgo', () => {
  it('English is byte-identical to the pre-i18n formatter', () => {
    const t = makeT(en);
    for (const ms of [-5, 0, 9_999, 10_000, 59_000, 60_000, 3_599_000, 3_600_000, 86_399_000, 86_400_000, 9e8]) {
      expect(formatAgo(ms, t), String(ms)).toBe(legacy(ms));
    }
    expect(makeT(en)('saved_ago', { ago: 'just now' })).toBe('Saved just now');
  });

  it('Thai uses the Thai keys', () => {
    expect(formatAgo(5 * 60_000, makeT(th))).toBe('5 นาทีที่แล้ว');
  });
});
