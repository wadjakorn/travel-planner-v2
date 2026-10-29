'use client';

import { Sparkle } from '@/components/icons';
import { useT } from '@/components/i18n-provider';
import { SubmitButton } from '@/components/submit-button';
import styles from './itinerary-sidebar.module.css';

type Props = {
  savings?: { time: string; swap: string } | null;
};

export function OptimizeStrip({ savings }: Props) {
  const t = useT();
  if (!savings) return null;
  // One sentence; split around {time} so the saving can be bold.
  const [beforeTime, afterTime = ''] = t('itin_optimize_body').split('{time}');

  return (
    <div className={styles.optStrip}>
      <span className={styles.optIcon}>
        <Sparkle />
      </span>
      <span className={styles.optText}>
        {beforeTime}
        <b>~{savings.time}</b>
        {afterTime}
      </span>
      <SubmitButton className={styles.optBtn}>
        {t('itin_optimize')}
      </SubmitButton>
    </div>
  );
}
