'use client';

// OverlayLink — a real link to a route that also opens an in-page overlay.
//
// Every trigger that opens an add/edit overlay points at the standalone route
// that renders the same form. With JS the click is intercepted and the overlay
// opens; without JS (or before hydration) the browser follows the href. That
// keeps the form reachable with scripting off, and keeps middle-click and
// open-in-new-tab working — both of which a <button> silently removes.

import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'onClick'> & {
  /** Runs instead of the navigation, for a plain unmodified left click. */
  onOpen: () => void;
};

/**
 * True when the browser would navigate in THIS tab. A modified click
 * (⌘/ctrl/shift/alt) or a non-primary button means the user asked for a new
 * tab or window, so we must not swallow it.
 */
export function isPlainLeftClick(e: MouseEvent): boolean {
  return (
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented
  );
}

export function OverlayLink({ onOpen, ...props }: Props) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        if (!isPlainLeftClick(e)) return;
        e.preventDefault();
        onOpen();
      }}
    />
  );
}
