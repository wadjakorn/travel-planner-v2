import { Sparkle } from '@/components/icons';
import { SubmitButton } from '@/components/submit-button';
import styles from './itinerary-sidebar.module.css';

type Props = {
  savings?: { time: string; swap: string } | null;
};

export function OptimizeStrip({ savings }: Props) {
  if (!savings) return null;

  return (
    <div className={styles.optStrip}>
      <span className={styles.optIcon}>
        <Sparkle />
      </span>
      <span className={styles.optText}>
        Reorder this day to save <b>~{savings.time}</b> driving
      </span>
      <SubmitButton className={styles.optBtn} pendingText="Optimizing…">
        Optimize
      </SubmitButton>
    </div>
  );
}
