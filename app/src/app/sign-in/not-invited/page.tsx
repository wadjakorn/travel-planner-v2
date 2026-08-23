// Rejection page for the invite-only gate (TP-0031). Both providers land
// here: lib/auth.ts returns this path as the signIn callback's redirect
// string, so there is one page and one copy to maintain.
//
// The attempted email address is deliberately NOT passed in — not in a query
// string (it would end up in server logs and in browser history) and not in
// the HTML. The copy says "the email address you just tried" precisely so
// nothing needs to be echoed back.
//
// Accepted trade-off: an invited address reaches /sign-in/verify-request
// while an uninvited one reaches this page, so the two are distinguishable.
// Deliberate — see docs/plans/invite-only-access.md §3.6 / R2.

import Link from 'next/link';
import type { Metadata } from 'next';
import { tServer } from '@/lib/i18n';
import styles from '../sign-in.module.css';

export const metadata: Metadata = { title: 'Invite only' };

// Where "request access" points. Falls back to the magic-link sender address
// so the link is never a dead `mailto:`.
const REQUEST_ACCESS_EMAIL =
  process.env.ACCESS_REQUEST_EMAIL ?? process.env.EMAIL_FROM ?? '';

export default async function NotInvitedPage() {
  const t = await tServer();
  const mailto = REQUEST_ACCESS_EMAIL
    ? `mailto:${REQUEST_ACCESS_EMAIL.replace(/^.*<|>$/g, '')}?subject=${encodeURIComponent('Access request')}`
    : null;

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
          <h2>{t('not_invited_title')}</h2>
          <p>{t('not_invited_p1')}</p>
          <p>{t('not_invited_p2')}</p>
          <p>
            {t('not_invited_p3')}{' '}
            {mailto ? (
              <a href={mailto}>{t('not_invited_request')}</a>
            ) : (
              t('not_invited_request')
            )}
            .
          </p>
        </div>

        <div className={styles.buttons}>
          <Link href="/sign-in" className={styles.btn}>
            <span>{t('not_invited_back')}</span>
          </Link>
        </div>

        <p className={styles.terms}>{t('not_invited_p4')}</p>
      </div>
    </div>
  );
}
