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
          {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
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
