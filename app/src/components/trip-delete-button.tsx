'use client';

// Trip delete trigger with a confirmation step. A single click no longer
// deletes: it opens the shared ConfirmDialog where Cancel is the prominent
// default, so an accidental click can't destroy a trip. Deletion runs the
// server action passed from the (server-component) TripCard.

import { useState, useTransition } from 'react';
import { Trash } from '@/components/icons';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useT } from '@/components/i18n-provider';

type Props = {
  tripId: string;
  title: string;
  onDelete: (formData: FormData) => Promise<void>;
};

export function TripDeleteButton({ tripId, title, onDelete }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startDelete] = useTransition();

  function confirmDelete() {
    const fd = new FormData();
    fd.set('tripId', tripId);
    startDelete(async () => {
      await onDelete(fd);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('trip_delete_label')}
        aria-label={t('trip_delete_label')}
        aria-haspopup="dialog"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface/85 text-muted backdrop-blur transition-colors hover:bg-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash width={14} height={14} />
      </button>

      <ConfirmDialog
        open={open}
        title={t('trip_delete_confirm_title')}
        message={t('trip_delete_confirm_body', { title })}
        busy={pending}
        onConfirm={confirmDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
