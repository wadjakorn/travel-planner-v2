'use client';

import { useState } from 'react';
import { Note } from '@/components/icons';
import { PlaceNoteModal } from './place-note-modal';

type Props = {
  placeId: string;
  placeName: string;
  note: string | null;
  action: (fd: FormData) => Promise<void>;
};

export function PlaceNoteLauncher({ placeId, placeName, note, action }: Props) {
  const [open, setOpen] = useState(false);
  const has = !!(note && note.trim().length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={has ? `Edit note for ${placeName}` : `Add note for ${placeName}`}
        title={has ? 'Edit note' : 'Add note'}
        className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
      >
        <Note width={16} height={16} />
      </button>
      {open ? (
        // No refresh call here: updatePlaceNoteAction revalidates the trip
        // path, which is what puts the new note on screen. The modal shows
        // "Saving…" until the action resolves.
        <PlaceNoteModal
          placeId={placeId}
          placeName={placeName}
          initialNote={note}
          action={action}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
