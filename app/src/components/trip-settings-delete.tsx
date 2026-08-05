'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash } from '@/components/icons';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui';

type Props = {
  tripId: string;
  title: string;
  onDelete: (formData: FormData) => Promise<void>;
};

export function TripSettingsDelete({ tripId, title, onDelete }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startDelete] = useTransition();

  function confirmDelete() {
    const fd = new FormData();
    fd.set('tripId', tripId);
    startDelete(async () => {
      await onDelete(fd);
      setOpen(false);
      // deleteTripAction only revalidates '/'. Without this the browser stays on
      // /trip/<deleted>/settings, which notFound()s on its next render.
      router.replace('/');
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="danger"
        onClick={() => setOpen(true)}
      >
        <Trash width={14} height={14} />
        Delete trip
      </Button>

      <ConfirmDialog
        open={open}
        title="Delete this trip?"
        message={`“${title}” will be removed from your trips.`}
        confirmLabel="Delete trip"
        busy={pending}
        onConfirm={confirmDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
