'use client';

import { useTransition } from 'react';
import { Drive, Walk, Transit } from '@/components/icons';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/toast';
import { isNavigationError, logActionFailure } from '@/lib/action-errors';
import { useT } from '@/components/i18n-provider';
import styles from './itinerary-list.module.css';

type Mode = 'drive' | 'walk' | 'transit';

type Props = {
  dayId: string;
  idx: number;
  mode: Mode;
  setModeAction: (formData: FormData) => Promise<void>;
};

const OPTIONS = [
  { value: 'drive' as const, label: 'itin_mode_drive' as const, icon: <Drive /> },
  { value: 'walk' as const, label: 'itin_mode_walk' as const, icon: <Walk /> },
  { value: 'transit' as const, label: 'itin_mode_transit' as const, icon: <Transit /> },
];

export function SegmentModePicker({ dayId, idx, mode, setModeAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const t = useT();

  function commit(next: Mode) {
    if (next === mode) return;
    const fd = new FormData();
    fd.set('dayId', dayId);
    fd.set('idx', String(idx));
    fd.set('mode', next);
    startTransition(async () => {
      try {
        await setModeAction(fd);
      } catch (e) {
        if (isNavigationError(e)) throw e;
        logActionFailure('segment mode', e);
        toast({ variant: 'error', title: t('itin_segment_mode_error_toast'), description: t('err_try_again_body') });
      }
    });
  }

  return (
    <Segmented
      ariaLabel={t('itin_segment_mode_aria')}
      value={mode}
      options={OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
      onChange={commit}
      disabled={isPending}
      activeClassName={styles.legActive}
    />
  );
}
