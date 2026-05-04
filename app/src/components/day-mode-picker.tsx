'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './segment-mode-picker.module.css';

type Mode = 'drive' | 'walk' | 'transit';

type Props = {
  dayId: string;
  defaultMode: Mode | null;
  setDayDefaultModeAction: (formData: FormData) => Promise<void>;
};

export function DayModePicker({
  dayId,
  defaultMode,
  setDayDefaultModeAction,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const value = defaultMode ?? '';

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Mode;
    if (!next) return;
    if (
      !confirm(
        `Override every segment in this day to "${next}"? This replaces individual settings.`,
      )
    ) {
      e.target.value = value;
      return;
    }
    const fd = new FormData();
    fd.set('dayId', dayId);
    fd.set('mode', next);
    startTransition(async () => {
      try {
        await setDayDefaultModeAction(fd);
        router.refresh();
      } catch {
        // ignore
      }
    });
  }

  return (
    <select
      className={styles.picker}
      value={value}
      onChange={onChange}
      disabled={isPending}
      aria-label="Day default travel mode"
      title="Override travel mode for all segments in this day"
    >
      <option value="" disabled>
        Day mode…
      </option>
      <option value="drive">All Drive</option>
      <option value="walk">All Walk</option>
      <option value="transit">All Transit</option>
    </select>
  );
}
