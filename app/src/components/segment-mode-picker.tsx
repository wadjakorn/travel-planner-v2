'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drive, Walk, Transit } from '@/components/icons';
import { Segmented } from '@/components/ui/segmented';

type Mode = 'drive' | 'walk' | 'transit';

type Props = {
  dayId: string;
  idx: number;
  mode: Mode;
  setModeAction: (formData: FormData) => Promise<void>;
};

const OPTIONS = [
  { value: 'drive' as const, label: 'Drive', icon: <Drive /> },
  { value: 'walk' as const, label: 'Walk', icon: <Walk /> },
  { value: 'transit' as const, label: 'Transit', icon: <Transit /> },
];

export function SegmentModePicker({ dayId, idx, mode, setModeAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function commit(next: Mode) {
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
    <Segmented
      ariaLabel="Travel mode"
      value={mode}
      options={OPTIONS}
      onChange={commit}
      disabled={isPending}
    />
  );
}
