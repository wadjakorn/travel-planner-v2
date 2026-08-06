'use client';

// Overlay host. Owns only the shell — scrim, focus, scroll lock, escape —
// never the content's behaviour. `onRequestClose` is a request, not a command:
// the caller may refuse it (unsaved changes) and the modal stays put.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import styles from './modal.module.css';

type Props = {
  open: boolean;
  onRequestClose: () => void;
  title: string;
  children: React.ReactNode;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Elements matching FOCUSABLE but hidden (display: none, detached, etc.)
// have no client rects and cannot actually take focus — real Tab traversal
// skips them, so the trap and initial-focus lookup must too.
function visibleFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

// Only the topmost overlay answers Escape. Without this, a nested overlay's
// Escape also reaches every Modal below it, because they all listen on the
// same node — and stopPropagation cannot stop a sibling listener there.
// Module-private; not exported.
const overlayStack: symbol[] = [];

export function Modal({ open, onRequestClose, title, children }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const idRef = useRef<symbol>(Symbol('modal'));
  // SSR guard: createPortal(..., document.body) is only safe once mounted.
  // `open` alone is not enough — a consumer that derives it synchronously
  // from a prop/search param (rather than starting false) could otherwise
  // reach the portal call during a server render. useSyncExternalStore (no
  // subscription, snapshot true only on the client) flips this after
  // hydration without a setState-in-effect cascade.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    overlayStack.push(id);
    return () => {
      const i = overlayStack.indexOf(id);
      if (i !== -1) overlayStack.splice(i, 1);
    };
  }, [open]);

  // Scroll lock. Padding compensates for the scrollbar the lock removes,
  // otherwise the page behind visibly jumps sideways as the modal opens.
  useEffect(() => {
    if (!open) return;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [open]);

  // Focus: move in on open, restore on close.
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current && visibleFocusable(panelRef.current)[0];
    (first ?? panelRef.current)?.focus();
    return () => {
      const el = restoreTo.current;
      if (el && document.contains(el)) el.focus?.();
    };
  }, [open]);

  // Escape + tab trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (overlayStack[overlayStack.length - 1] !== idRef.current) return;
        e.stopImmediatePropagation();
        onRequestClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = visibleFocusable(panelRef.current);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onRequestClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(e) => {
        // mousedown, not click: a drag that starts inside the panel and ends
        // on the scrim (text selection) must not close the form.
        if (e.target === e.currentTarget) onRequestClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
