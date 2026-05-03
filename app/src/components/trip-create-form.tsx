// TripCreateForm — server component rendered at /trip/new.
// Accepts a server action via props; no client JS required.

import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import styles from './trip-create-form.module.css';

type Props = {
  action: (formData: FormData) => Promise<void>;
  cancelHref?: string;
};

export function TripCreateForm({ action, cancelHref = '/' }: Props) {
  return (
    <div className={signInStyles.wrap}>
      <div className={signInStyles.bg} aria-hidden>
        <div className={`${signInStyles.blob} ${signInStyles.b1}`} />
        <div className={`${signInStyles.blob} ${signInStyles.b2}`} />
        <div className={`${signInStyles.blob} ${signInStyles.b3}`} />
      </div>

      <div className={signInStyles.card}>
        <div className={signInStyles.brand}>
          <svg viewBox="0 0 32 32" fill="currentColor" width="36" height="36" aria-hidden>
            <path d="M16 3.2c-3.4 0-5.5 2-7.6 2-2.2 0-4.6-1.9-6.6.5C-.6 8.5.4 14.6 3.6 19.7c1.6 2.5 3.7 5.3 6.5 5.2 2.6-.1 3.6-1.7 6.7-1.7 3.1 0 4 1.7 6.7 1.6 2.8-.1 4.6-2.6 6.3-5.1 1.9-2.9 2.7-5.7 2.7-5.9-.1 0-5.2-2-5.3-7.9 0-4.9 4-7.3 4.2-7.4-2.3-3.4-5.9-3.8-7.2-3.9-3.3-.3-6 1.9-7.5 1.9z" />
          </svg>
          <h1>New trip</h1>
        </div>

        <form action={action} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="tcf-title" className={styles.label}>
              Title
            </label>
            <input
              id="tcf-title"
              name="title"
              type="text"
              required
              placeholder="Mount Fuji &amp; Kamakura"
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="tcf-subtitle" className={styles.label}>
              Subtitle
            </label>
            <input
              id="tcf-subtitle"
              name="subtitle"
              type="text"
              placeholder="Tokyo · Hakone · Kamakura"
              className={styles.input}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="tcf-start-date" className={styles.label}>
                Start date
              </label>
              <input
                id="tcf-start-date"
                name="startDate"
                type="date"
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="tcf-end-date" className={styles.label}>
                End date
              </label>
              <input
                id="tcf-end-date"
                name="endDate"
                type="date"
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.row} style={{ marginTop: 8 }}>
            <Link href={cancelHref} className={styles.cancelBtn}>
              Cancel
            </Link>
            <SubmitButton className={signInStyles.btn} pendingText={<span>Creating…</span>}>
              <span>Create trip</span>
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
