// Sign-in error screen. Auth.js v5 redirects here on OAuth / credential failures.
// Reads ?error= query param and maps known codes to friendly copy.

import Link from 'next/link';
import type { Metadata } from 'next';
import styles from '../sign-in.module.css';

export const metadata: Metadata = { title: 'Sign-in error' };

type ErrorInfo = { title: string; body: string };

function getErrorInfo(code: string | undefined): ErrorInfo {
  switch (code) {
    case 'Configuration':
      return {
        title: 'Server configuration problem',
        body: "An authentication provider isn't set up correctly. Please contact support.",
      };
    case 'AccessDenied':
      return {
        title: 'Access denied',
        body: 'You declined access. Try again or use a different method.',
      };
    case 'Verification':
      return {
        title: 'Sign-in link expired',
        body: 'That magic link has been used or has expired. Request a new one.',
      };
    case 'OAuthSignin':
    case 'OAuthCallback':
    case 'OAuthCreateAccount':
      return {
        title: "Couldn't sign in with that provider",
        body: "Something went wrong on the provider's end. Try again, or use a different method.",
      };
    case 'EmailCreateAccount':
    case 'EmailSignin':
      return {
        title: "Couldn't send the magic link",
        body: 'Email delivery failed. Check the address and try again.',
      };
    case 'CredentialsSignin':
      return {
        title: 'Invalid sign-in',
        body: "The credentials don't match an account. Try again.",
      };
    default:
      return {
        title: 'Something went wrong',
        body: 'Please try signing in again.',
      };
  }
}

export default async function SignInErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { title, body } = getErrorInfo(error);

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
          <h2>{title}</h2>
          <p>{body}</p>
        </div>

        <div className={styles.buttons}>
          <Link href="/sign-in" className={styles.btn}>
            <span>Try again</span>
          </Link>
        </div>

        <p className={styles.terms}>Need help? Contact support.</p>
      </div>
    </div>
  );
}
