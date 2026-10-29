'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drive, Walk, Transit } from '@/components/icons';
import { Segmented, type SegmentedOption } from '@/components/ui/segmented';
import { ConfirmDialog } from './confirm-dialog';
import { useToast } from '@/components/toast';
import { isNavigationError, logActionFailure } from '@/lib/action-errors';

type Mode = 'drive' | 'walk' | 'transit' | 'mixed';

const OPTIONS: SegmentedOption<Mode>[] = [
  { value: 'mixed', label: 'Mixed', title: 'Mixed per leg' },
  { value: 'drive', label: 'Drive', icon: <Drive />, title: 'All Drive' },
  { value: 'walk', label: 'Walk', icon: <Walk />, title: 'All Walk' },
  { value: 'transit', label: 'Transit', icon: <Transit />, title: 'All Transit' },
];

type Props = {
  dayId: string;
  defaultMode: 'drive' | 'walk' | 'transit' | null;
  setDayDefaultModeAction: (formData: FormData) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
};

export function DayModePicker({
  dayId,
  defaultMode,
  setDayDefaultModeAction,
  onBusyChange,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const onBusyRef = useRef(onBusyChange);
  // Written in an effect, not during render: a ref is not render output.
  useEffect(() => {
    onBusyRef.current = onBusyChange;
  });
  useEffect(() => {
    onBusyRef.current?.(isPending);
  }, [isPending]);
  const value: Mode = defaultMode ?? 'mixed';
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);

  function commit(next: Mode) {
    const fd = new FormData();
    fd.set('dayId', dayId);
    fd.set('mode', next);
    startTransition(async () => {
      try {
        await setDayDefaultModeAction(fd);
        router.refresh();
      } catch (e) {
        if (isNavigationError(e)) throw e;
        logActionFailure('day mode', e);
        toast({ variant: 'error', title: "Couldn't change the day's travel mode", description: 'Try again.' });
      }
    });
  }

  function onChange(next: Mode) {
    if (next === value) return;
    if (next === 'mixed') {
      commit(next);
      return;
    }
    setPendingMode(next);
  }

  return (
    <>
      <Segmented
        ariaLabel="Day default travel mode"
        value={value}
        options={OPTIONS}
        onChange={onChange}
        disabled={isPending}
      />

      <ConfirmDialog
        open={pendingMode !== null}
        title="Override day mode?"
        message={
          pendingMode
            ? `Override every segment in this day to "${pendingMode}"? This replaces individual settings.`
            : undefined
        }
        confirmLabel="Override"
        onCancel={() => setPendingMode(null)}
        onConfirm={() => {
          const m = pendingMode;
          setPendingMode(null);
          if (m) commit(m);
        }}
      />
    </>
  );
}
