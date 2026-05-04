import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../sign-in.module.css';

export const metadata: Metadata = { title: 'Check your email' };

export default function VerifyRequestPage() {
  return (
    <div className={styles.wrap}>
      <div className={styles.bg} aria-hidden>
        <div className={`${styles.blob} ${styles.b1}`} />
        <div className={`${styles.blob} ${styles.b2}`} />
        <div className={`${styles.blob} ${styles.b3}`} />
      </div>

      <div className={styles.card}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
          <h1>Traver Planel</h1>
        </div>

        <div className={styles.hero}>
          <h2>Check your email</h2>
          <p>We sent a sign-in link to your inbox. The link expires in 24 hours.</p>
        </div>

        <div className={styles.buttons}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: '#6e6e73' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden style={{ flexShrink: 0, marginTop: '1px' }}>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            <span>Didn&apos;t get it? Check spam, then try again.</span>
          </div>

          <Link href="/sign-in" className={styles.btn} style={{ textDecoration: 'none', justifyContent: 'center' }}>
            <span style={{ paddingRight: 0 }}>Use a different method</span>
          </Link>
        </div>

        <p className={styles.terms}>Need help? Contact support.</p>
      </div>
    </div>
  );
}
