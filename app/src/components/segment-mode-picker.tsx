'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './segment-mode-picker.module.css';

type Mode = 'drive' | 'walk' | 'transit';

type Props = {
  dayId: string;
  idx: number;
  mode: Mode;
  setModeAction: (formData: FormData) => Promise<void>;
};

export function SegmentModePicker({ dayId, idx, mode, setModeAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Mode;
    if (next === mode) return;
    const fd = new FormData();
    fd.set('dayId', dayId);
    fd.set('idx', String(idx));
    fd.set('mode', next);
    startTransition(async () => {
      try {
        await setModeAction(fd);
        router.refresh();
      } catch {
        // swallow; revalidate will reset
      }
    });
  }

  return (
    <select
      className={styles.picker}
      value={mode}
      onChange={onChange}
      disabled={isPending}
      aria-label="Travel mode"
    >
      <option value="drive">Drive</option>
      <option value="walk">Walk</option>
      <option value="transit">Transit</option>
    </select>
  );
}
