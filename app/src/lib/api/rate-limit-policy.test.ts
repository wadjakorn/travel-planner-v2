import { describe, it, expect } from 'vitest';
import { posIntEnv, decideRateLimit } from './rate-limit-policy';

describe('posIntEnv', () => {
  const KEY = 'API_RATE_LIMIT_TEST_VALUE';
  const withEnv = (v: string | undefined, fn: () => void) => {
    const prev = process.env[KEY];
    if (v === undefined) delete process.env[KEY];
    else process.env[KEY] = v;
    try {
      fn();
    } finally {
      if (prev === undefined) delete process.env[KEY];
      else process.env[KEY] = prev;
    }
  };

  it('returns the fallback when unset', () => {
    withEnv(undefined, () => expect(posIntEnv(KEY, 60)).toBe(60));
  });

  it('accepts a valid positive integer', () => {
    withEnv('120', () => expect(posIntEnv(KEY, 60)).toBe(120));
  });

  it.each(['0', '-1', 'abc', '1.5', '', 'NaN'])(
    'falls back on invalid value %j',
    (bad) => {
      withEnv(bad, () => expect(posIntEnv(KEY, 60)).toBe(60));
    },
  );
});

describe('decideRateLimit', () => {
  const MAX = 60;
  const WINDOW = 60;

  it('allows requests 1..MAX', () => {
    for (let count = 1; count <= MAX; count++) {
      expect(decideRateLimit({ count, resetIn: 30 }, MAX, WINDOW)).toEqual({
        ok: true,
      });
    }
  });

  it('denies request MAX+1 with a positive Retry-After and the limit', () => {
    const res = decideRateLimit({ count: MAX + 1, resetIn: 42 }, MAX, WINDOW);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('expected denial');
    expect(res.retryAfter).toBe(42);
    expect(res.retryAfter).toBeGreaterThan(0);
    expect(res.limit).toBe(MAX);
  });

  it('floors Retry-After at 1 second even when the window is already elapsed', () => {
    const res = decideRateLimit({ count: MAX + 5, resetIn: 0 }, MAX, WINDOW);
    if (res.ok) throw new Error('expected denial');
    // resetIn 0 -> falls back to the window length (60), never 0.
    expect(res.retryAfter).toBe(WINDOW);
    expect(res.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('fails open when the UPSERT returned no row', () => {
    expect(decideRateLimit(undefined, MAX, WINDOW)).toEqual({ ok: true });
  });

  it('respects a custom (e.g. env-tuned) max', () => {
    expect(decideRateLimit({ count: 5, resetIn: 10 }, 5, WINDOW)).toEqual({
      ok: true,
    });
    const res = decideRateLimit({ count: 6, resetIn: 10 }, 5, WINDOW);
    expect(res.ok).toBe(false);
  });
});
