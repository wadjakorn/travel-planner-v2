'use client';

import { useState } from 'react';
import { Note } from '@/components/icons';
import { PlaceNoteModal } from './place-note-modal';
import { useT } from '@/components/i18n-provider';

type Props = {
  placeId: string;
  placeName: string;
  note: string | null;
  action: (fd: FormData) => Promise<void>;
};

export function PlaceNoteLauncher({ placeId, placeName, note, action }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const has = !!(note && note.trim().length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          has
            ? t('place_note_edit_aria', { name: placeName })
            : t('place_note_add_aria', { name: placeName })
        }
        title={has ? t('place_note_edit_title') : t('place_note_add_title')}
        className="tp-hit rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
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
