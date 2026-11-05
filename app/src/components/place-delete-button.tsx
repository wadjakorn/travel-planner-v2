'use client';

// Trash button for a place row (TP-0112). Deleting a place is permanent (no
// soft delete), so it confirms first through the shared ConfirmDialog —
// Cancel is the focused default — like trip delete.

import { useState, useTransition } from 'react';
import { Trash } from '@/components/icons';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useT } from '@/components/i18n-provider';

type Props = {
  placeId: string;
  name: string;
  removeAction: (formData: FormData) => Promise<void>;
};

export function PlaceDeleteButton({ placeId, name, removeAction }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startRemove] = useTransition();

  function confirmRemove() {
    const fd = new FormData();
    fd.set('placeId', placeId);
    startRemove(async () => {
      await removeAction(fd);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        data-place-delete={placeId}
        onClick={() => setOpen(true)}
        aria-label={t('place_remove_from_day_aria', { name })}
        aria-haspopup="dialog"
        className="tp-hit inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash width={16} height={16} />
      </button>
      <ConfirmDialog
        open={open}
        title={t('place_delete_confirm_title', { name })}
        message={t('place_delete_confirm_body')}
        confirmLabel={t('place_delete_confirm_action')}
        busy={pending}
        onConfirm={confirmRemove}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
