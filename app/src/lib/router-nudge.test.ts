import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nudgeUntil } from './router-nudge';

describe('nudgeUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('kicks every interval until done', () => {
    let done = false;
    const kick = vi.fn();
    nudgeUntil(() => done, kick, { intervalMs: 100, maxMs: 10_000 });
    expect(kick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(350);
    expect(kick).toHaveBeenCalledTimes(3);
    done = true;
    vi.advanceTimersByTime(1000);
    expect(kick).toHaveBeenCalledTimes(3);
  });

  it('never kicks when already done', () => {
    const kick = vi.fn();
    nudgeUntil(() => true, kick, { intervalMs: 100, maxMs: 10_000 });
    vi.advanceTimersByTime(1000);
    expect(kick).not.toHaveBeenCalled();
  });

  it('gives up after maxMs and warns outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const kick = vi.fn();
    nudgeUntil(() => false, kick, { intervalMs: 100, maxMs: 500 });
    vi.advanceTimersByTime(5000);
    expect(kick).toHaveBeenCalledTimes(5);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('stops when cancelled', () => {
    const kick = vi.fn();
    const cancel = nudgeUntil(() => false, kick, { intervalMs: 100, maxMs: 10_000 });
    vi.advanceTimersByTime(250);
    cancel();
    vi.advanceTimersByTime(1000);
    expect(kick).toHaveBeenCalledTimes(2);
  });
});
