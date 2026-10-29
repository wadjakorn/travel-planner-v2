'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash } from '@/components/icons';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui';
import { useT } from '@/components/i18n-provider';

type Props = {
  tripId: string;
  title: string;
  onDelete: (formData: FormData) => Promise<void>;
};

export function TripSettingsDelete({ tripId, title, onDelete }: Props) {
  const t = useT();
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
        {t('trip_delete_label')}
      </Button>

      <ConfirmDialog
        open={open}
        title={t('trip_delete_confirm_title')}
        message={t('trip_delete_confirm_body', { title })}
        confirmLabel={t('trip_delete_label')}
        busy={pending}
        onConfirm={confirmDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
