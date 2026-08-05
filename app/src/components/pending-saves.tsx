'use client';

// Tracks how many <ActionForm> saves are in flight, app-wide, and stops the
// user from walking away mid-save.
//
// Why this exists: a form that unmounts while its action is in flight never
// reports the result. The mutation still completes on the server, but a
// rejected save (a validation guard, a permission error) leaves no trace on
// screen — the user believes it saved. So navigation is blocked while a save is
// pending: in-page nav is disabled outright, and a link or a browser unload
// asks first.
//
// Mount <PendingSaveProvider> once, in the root layout, alongside the toasts.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';

type PendingSaves = {
  pendingCount: number;
  begin: () => void;
  end: () => void;
};

const PendingSaveContext = createContext<PendingSaves>({
  pendingCount: 0,
  begin: () => {},
  end: () => {},
});

export function usePendingSaves(): PendingSaves {
  return useContext(PendingSaveContext);
}

export function PendingSaveProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const begin = useCallback(() => setPendingCount((n) => n + 1), []);
  const end = useCallback(() => setPendingCount((n) => Math.max(0, n - 1)), []);
  const value = useMemo(
    () => ({ pendingCount, begin, end }),
    [pendingCount, begin, end],
  );

  return (
    <PendingSaveContext.Provider value={value}>
      {children}
      <NavigationGuard active={pendingCount > 0} />
    </PendingSaveContext.Provider>
  );
}

function NavigationGuard({ active }: { active: boolean }) {
  const router = useRouter();
  const [heldHref, setHeldHref] = useState<string | null>(null);

  // Tab close, reload, or a typed URL: the browser's own prompt is the only
  // thing that can interrupt these.
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);

  // In-app links: intercept in the capture phase, before the router sees the
  // click, and ask. Modified clicks (new tab, download) are left alone.
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.href === window.location.href) return;

      e.preventDefault();
      e.stopPropagation();
      setHeldHref(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active]);

  return (
    <ConfirmDialog
      open={heldHref !== null}
      title="Still saving"
      message="Leaving now means you will not see whether this save succeeded. Leave anyway?"
      confirmLabel="Leave"
      onConfirm={() => {
        const href = heldHref;
        setHeldHref(null);
        if (href) router.push(href);
      }}
      onCancel={() => setHeldHref(null)}
    />
  );
}
