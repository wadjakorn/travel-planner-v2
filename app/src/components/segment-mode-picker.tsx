'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drive, Walk, Transit } from '@/components/icons';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/toast';
import { isNavigationError, logActionFailure } from '@/lib/action-errors';

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
  const { toast } = useToast();

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
      } catch (e) {
        if (isNavigationError(e)) throw e;
        logActionFailure('segment mode', e);
        toast({ variant: 'error', title: "Couldn't change travel mode", description: 'Try again.' });
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
