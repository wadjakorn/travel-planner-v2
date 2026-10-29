import { describe, expect, it } from 'vitest';
import { createScrollLock } from './scroll-lock';

const body = () => ({ style: { overflow: '', paddingRight: '' } });

describe('createScrollLock', () => {
  it('locks on the first acquire and restores on the last release', () => {
    const b = body();
    const lock = createScrollLock(b);
    lock.acquire(15);
    expect(b.style.overflow).toBe('hidden');
    expect(b.style.paddingRight).toBe('15px');
    lock.acquire(0);
    lock.release();
    expect(b.style.overflow).toBe('hidden');
    lock.release();
    expect(b.style.overflow).toBe('');
    expect(b.style.paddingRight).toBe('');
  });

  it('restores the original values whatever order the holders release in', () => {
    // The joint-unmount case: a ConfirmDialog over a Modal, both deleted in one
    // commit, cleanups run parent-first.
    const b = { style: { overflow: 'auto', paddingRight: '2px' } };
    const lock = createScrollLock(b);
    lock.acquire(0); // A (outer)
    lock.acquire(0); // B (inner) — sees 'hidden', must not save it
    lock.release(); // A first
    lock.release(); // then B
    expect(b.style.overflow).toBe('auto');
    expect(b.style.paddingRight).toBe('2px');
  });

  it('leaves padding alone when there is no scrollbar gap', () => {
    const b = body();
    const lock = createScrollLock(b);
    lock.acquire(0);
    expect(b.style.paddingRight).toBe('');
    lock.release();
  });

  it('release with nothing held is a no-op', () => {
    const b = { style: { overflow: 'scroll', paddingRight: '' } };
    const lock = createScrollLock(b);
    lock.release();
    expect(b.style.overflow).toBe('scroll');
    lock.acquire(0);
    expect(b.style.overflow).toBe('hidden');
    lock.release();
    expect(b.style.overflow).toBe('scroll');
  });
});
