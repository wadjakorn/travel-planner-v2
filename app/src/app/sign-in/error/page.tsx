// Sign-in error screen. Auth.js v5 redirects here on OAuth / credential failures.
// Reads ?error= query param and maps known codes to friendly copy.

import Link from 'next/link';
import type { Metadata } from 'next';
import { tServer, type MessageKey } from '@/lib/i18n';
import styles from '../sign-in.module.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer();
  return { title: t('auth_error_meta_title') };
}

type ErrorInfo = { title: MessageKey; body: MessageKey };

function getErrorInfo(code: string | undefined): ErrorInfo {
  switch (code) {
    case 'Configuration':
      return { title: 'auth_err_config_title', body: 'auth_err_config_body' };
    case 'AccessDenied':
      return { title: 'auth_err_denied_title', body: 'auth_err_denied_body' };
    case 'Verification':
      return { title: 'auth_err_link_expired_title', body: 'auth_err_link_expired_body' };
    case 'OAuthSignin':
    case 'OAuthCallback':
    case 'OAuthCreateAccount':
      return { title: 'auth_err_oauth_title', body: 'auth_err_oauth_body' };
    case 'EmailCreateAccount':
    case 'EmailSignin':
      return { title: 'auth_err_email_title', body: 'auth_err_email_body' };
    // Raised by the anonymous sign-in rate limiter (lib/anon-rate-limit.ts),
    // not by Auth.js.
    case 'RateLimited':
      return { title: 'auth_err_rate_limited_title', body: 'auth_err_rate_limited_body' };
    case 'CredentialsSignin':
      return { title: 'auth_err_credentials_title', body: 'auth_err_credentials_body' };
    default:
      return { title: 'err_title', body: 'auth_err_default_body' };
  }
}

export default async function SignInErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { title, body } = getErrorInfo(error);
  const t = await tServer();

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
          <h2>{t(title)}</h2>
          <p>{t(body)}</p>
        </div>

        <div className={styles.buttons}>
          <Link href="/sign-in" className={styles.btn}>
            <span>{t('try_again')}</span>
          </Link>
        </div>

        <p className={styles.terms}>{t('auth_need_help')}</p>
      </div>
    </div>
  );
}
