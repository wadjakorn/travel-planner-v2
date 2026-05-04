import styles from './itinerary-sidebar.module.css';

type Props = {
  title: string;
  subtitle?: string | null;
  dates: string;
  daysCount: number;
  travelers: number;
  cover?: string | null;
};

export function TripCover({ title, subtitle, dates, daysCount, travelers }: Props) {
  return (
    <div className={styles.cover}>
      <div className={styles.coverOverlay}>
        {subtitle && <div className={styles.coverEyebrow}>{subtitle}</div>}
        <h1 className={styles.coverTitle}>{title}</h1>
        <div className={styles.coverMeta}>
          {dates} · {daysCount} {daysCount === 1 ? 'day' : 'days'} · {travelers}{' '}
          {travelers === 1 ? 'traveler' : 'travelers'}
        </div>
      </div>
    </div>
  );
}
