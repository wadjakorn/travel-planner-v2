'use client';

// Trip delete trigger with a confirmation step. A single click no longer
// deletes: it opens the shared ConfirmDialog where Cancel is the prominent
// default, so an accidental click can't destroy a trip. Deletion runs the
// server action passed from the (server-component) TripCard.

import { useState, useTransition } from 'react';
import { Trash } from '@/components/icons';
import { ConfirmDialog } from '@/components/confirm-dialog';

type Props = {
  tripId: string;
  title: string;
  onDelete: (formData: FormData) => Promise<void>;
};

export function TripDeleteButton({ tripId, title, onDelete }: Props) {
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
        title="Delete trip"
        aria-label="Delete trip"
        aria-haspopup="dialog"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-zinc-600 backdrop-blur transition-colors hover:bg-white hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash width={14} height={14} />
      </button>

      <ConfirmDialog
        open={open}
        title="Delete this trip?"
        message={`“${title}” will be removed from your trips.`}
        busy={pending}
        onConfirm={confirmDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
