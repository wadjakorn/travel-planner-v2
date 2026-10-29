'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drive, Walk, Transit } from '@/components/icons';
import { Segmented, type SegmentedOption } from '@/components/ui/segmented';
import { ConfirmDialog } from './confirm-dialog';
import { useToast } from '@/components/toast';
import { isNavigationError, logActionFailure } from '@/lib/action-errors';
import { useT } from '@/components/i18n-provider';
import type { MessageKey } from '@/lib/i18n-client';

type Mode = 'drive' | 'walk' | 'transit' | 'mixed';

const MODE_LABEL: Record<Mode, MessageKey> = {
  mixed: 'itin_mode_mixed',
  drive: 'itin_mode_drive',
  walk: 'itin_mode_walk',
  transit: 'itin_mode_transit',
};

const OPTIONS: { value: Mode; title: MessageKey; icon?: React.ReactNode }[] = [
  { value: 'mixed', title: 'itin_mode_mixed_title' },
  { value: 'drive', icon: <Drive />, title: 'itin_mode_all_drive_title' },
  { value: 'walk', icon: <Walk />, title: 'itin_mode_all_walk_title' },
  { value: 'transit', icon: <Transit />, title: 'itin_mode_all_transit_title' },
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
  const t = useT();
  const options: SegmentedOption<Mode>[] = OPTIONS.map((o) => ({
    ...o,
    label: t(MODE_LABEL[o.value]),
    title: t(o.title),
  }));
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
        toast({ variant: 'error', title: t('itin_day_mode_error_toast'), description: t('err_try_again_body') });
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
        ariaLabel={t('itin_day_mode_aria')}
        value={value}
        options={options}
        onChange={onChange}
        disabled={isPending}
      />

      <ConfirmDialog
        open={pendingMode !== null}
        title={t('itin_day_mode_override_title')}
        message={
          pendingMode
            ? // The mode reads in lower case mid-sentence ("drive").
              t('itin_day_mode_override_body', { mode: t(MODE_LABEL[pendingMode]).toLowerCase() })
            : undefined
        }
        confirmLabel={t('itin_day_mode_override_confirm')}
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
