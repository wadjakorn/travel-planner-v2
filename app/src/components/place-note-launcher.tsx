'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Note } from '@/components/icons';
import { Spinner } from '@/components/spinner';
import { PlaceNoteModal } from './place-note-modal';

type Props = {
  placeId: string;
  placeName: string;
  note: string | null;
  action: (fd: FormData) => Promise<void>;
};

export function PlaceNoteLauncher({ placeId, placeName, note, action }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const has = !!(note && note.trim().length > 0);

  const onSaved = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <>
      {pending ? (
        <span
          className="inline-flex h-7 w-7 items-center justify-center"
          aria-label="Saving note"
        >
          <Spinner size={16} color="#0071e3" trackColor="rgba(0,113,227,0.2)" />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={has ? `Edit note for ${placeName}` : `Add note for ${placeName}`}
          title={has ? 'Edit note' : 'Add note'}
          className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <Note width={16} height={16} />
        </button>
      )}
      {open ? (
        <PlaceNoteModal
          placeId={placeId}
          placeName={placeName}
          initialNote={note}
          action={action}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}
