'use client';

// Shared confirmation dialog for destructive actions. Cancel is the prominent,
// default (focused) action; the destructive confirm is de-emphasized so the
// safe choice is the obvious one — Enter right after opening cancels. Escape
// or a backdrop click cancels. Built on Modal, so opened over another Modal it
// stacks above it (later portal, same z-index), takes Escape alone, and
// returns focus inside the Modal underneath when it closes.

import { useId, useRef } from 'react';
import { Button, Modal } from '@/components/ui';
import { useT } from '@/components/i18n-provider';

type Props = {
  open: boolean;
  title: string;
  message?: string;
  /** Defaults to the translated "Delete". */
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const msgId = useId();

  return (
    <Modal
      open={open}
      onRequestClose={onCancel}
      title={title}
      size="sm"
      role="alertdialog"
      describedBy={message ? msgId : undefined}
      initialFocusRef={cancelRef}
    >
      <div className="p-5 text-foreground">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {message && (
          <p id={msgId} className="mt-1 text-sm text-muted">
            {message}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          {/* Destructive action, intentionally de-emphasized. */}
          <Button
            type="button"
            variant="dangerQuiet"
            loading={busy}
            onClick={onConfirm}
            className="rounded-full"
          >
            {confirmLabel ?? t('delete')}
          </Button>
          {/* Prominent, default (focused) action. */}
          <Button
            ref={cancelRef}
            type="button"
            variant="primary"
            onClick={onCancel}
            className="rounded-full"
          >
            {t('cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
