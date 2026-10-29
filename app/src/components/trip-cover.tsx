import { getLang, tServer } from '@/lib/i18n';
import { pluralKey } from '@/lib/i18n-client';
import styles from './itinerary-sidebar.module.css';

type Props = {
  title: string;
  subtitle?: string | null;
  dates: string;
  daysCount: number;
  travelers: number;
  cover?: string | null;
};

// Server component (rendered by the trip page): no useTp(), so plurals go
// through pluralKey with the server's language.
export async function TripCover({ title, subtitle, dates, daysCount, travelers }: Props) {
  const [t, lang] = await Promise.all([tServer(), getLang()]);
  return (
    <div className={styles.cover}>
      <div className={styles.coverOverlay}>
        {subtitle && <div className={styles.coverEyebrow}>{subtitle}</div>}
        <h1 className={styles.coverTitle}>{title}</h1>
        <div className={styles.coverMeta}>
          {dates} · {t(pluralKey(lang, 'trip_days', daysCount), { n: daysCount })} ·{' '}
          {t(pluralKey(lang, 'trip_travelers', travelers), { n: travelers })}
        </div>
      </div>
    </div>
  );
}
