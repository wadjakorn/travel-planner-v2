'use client';

// Binds form-dirty to a real <form> and gates every close path through one
// confirmation. The snapshot is taken after mount (not on first render) so
// fields that hydrate with a default value do not count as edits.

import { useCallback, useEffect, useRef, useState } from 'react';
import { isDirty, snapshotForm } from '@/lib/form-dirty';

export function useDirtyForm() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const snapshot = useRef<string>('');
  const pendingClose = useRef<(() => void) | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (formRef.current) snapshot.current = snapshotForm(formRef.current);
  }, []);

  // Warn on tab close / reload — the browser's own dialog, since ours cannot
  // block navigation.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (formRef.current && isDirty(snapshot.current, formRef.current)) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const markClean = useCallback(() => {
    if (formRef.current) snapshot.current = snapshotForm(formRef.current);
  }, []);

  const requestClose = useCallback((close: () => void) => {
    if (formRef.current && isDirty(snapshot.current, formRef.current)) {
      pendingClose.current = close;
      setConfirmOpen(true);
      return;
    }
    close();
  }, []);

  const confirmDiscard = useCallback(() => {
    setConfirmOpen(false);
    const close = pendingClose.current;
    pendingClose.current = null;
    close?.();
  }, []);

  const cancelDiscard = useCallback(() => {
    setConfirmOpen(false);
    pendingClose.current = null;
  }, []);

  return { formRef, markClean, requestClose, confirmOpen, confirmDiscard, cancelDiscard };
}
