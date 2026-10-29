// Ref-counted body scroll lock. Each open Modal holds one reference. Saving
// and restoring per-Modal breaks with nested dialogs: when a ConfirmDialog
// and the Modal under it unmount in the same commit, React runs the cleanups
// parent-first, so the inner one would restore the 'hidden' it saw on open
// and leave the page unscrollable. Counting doesn't depend on that order.

type LockTarget = { style: { overflow: string; paddingRight: string } };

export function createScrollLock(target: LockTarget | (() => LockTarget)) {
  const get = typeof target === 'function' ? target : () => target;
  let count = 0;
  let prevOverflow = '';
  let prevPad = '';
  return {
    /** `gapPx` = scrollbar width the lock removes; padded so the page doesn't jump. */
    acquire(gapPx: number) {
      count += 1;
      if (count !== 1) return;
      const { style } = get();
      prevOverflow = style.overflow;
      prevPad = style.paddingRight;
      style.overflow = 'hidden';
      if (gapPx > 0) style.paddingRight = `${gapPx}px`;
    },
    release() {
      if (count === 0) return;
      count -= 1;
      if (count !== 0) return;
      const { style } = get();
      style.overflow = prevOverflow;
      style.paddingRight = prevPad;
    },
  };
}

export const bodyScrollLock = createScrollLock(() => document.body);
