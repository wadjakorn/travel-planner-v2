'use client';

import { useCallback, useRef, type KeyboardEvent } from 'react';

// Dismissal for the non-modal map popups (pin card, search preview): Esc
// closes, and focus that was inside the popup returns to the trip map region
// ([data-trip-map]) instead of falling to <body> when the popup unmounts.
//
// close() is idempotent per mount: the pin card's onClose toggles the active
// place, so a second fire (Esc + a native InfoWindow close) would reopen it.
// Callers mount one popup per item (key={pin.id} / key={preview.id}), which
// resets the guard.
export function usePopupDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const closedRef = useRef(false);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    const el = ref.current;
    const hadFocus = !!el && el.contains(document.activeElement);
    // Resolve before onClose: the popup may unmount synchronously.
    const region = el?.closest<HTMLElement>('[data-trip-map]') ?? null;
    onClose();
    if (hadFocus) region?.focus({ preventScroll: true });
  }, [onClose]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    },
    [close],
  );

  return { ref, onKeyDown, close };
}
