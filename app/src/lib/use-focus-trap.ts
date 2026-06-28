'use client';

// Focus management for dialogs/sheets: on open, move focus into the container
// and remember what was focused; while open, keep Tab/Shift+Tab cycling inside;
// on close, restore focus to the trigger. Pair with role="dialog" aria-modal.

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(active = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus inside on open (first focusable, else the container itself).
    const first = focusable()[0];
    if (first) first.focus();
    else {
      node.setAttribute('tabindex', '-1');
      node.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === firstEl || !node!.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else if (activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      // Restore focus to the trigger if it's still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return ref;
}
