'use client';

import { useState } from 'react';
import { Edit } from '@/components/icons';
import { HotelEditModal } from './hotel-edit-modal';
import styles from './hotels-view.module.css';

type Initial = {
  bookingId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeIdExternal: string | null;
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
};

type Props = {
  initial: Initial;
  action: (fd: FormData) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
};

export function HotelEditLauncher({ initial, action, onBusyChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={styles.editBtn}
        aria-label={`Edit ${initial.name}`}
      >
        <Edit aria-hidden="true" /> Edit
      </button>
      {open ? (
        <HotelEditModal
          initial={initial}
          action={action}
          onClose={() => setOpen(false)}
          onBusyChange={onBusyChange}
        />
      ) : null}
    </>
  );
}
