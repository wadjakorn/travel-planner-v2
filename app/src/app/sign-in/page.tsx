import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth, signIn, providerIds } from '@/lib/auth';
import { SubmitButton } from '@/components/submit-button';
import styles from './sign-in.module.css';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect('/');

  const hasEmail = providerIds.includes('nodemailer');

  return (
    <div className={styles.wrap}>
      <div className={styles.bg} aria-hidden>
        <div className={`${styles.blob} ${styles.b1}`} />
        <div className={`${styles.blob} ${styles.b2}`} />
        <div className={`${styles.blob} ${styles.b3}`} />
      </div>

      <div className={styles.card}>
        <div className={styles.brand}>
          <svg viewBox="0 0 32 32" fill="currentColor" width="36" height="36">
            <path d="M16 3.2c-3.4 0-5.5 2-7.6 2-2.2 0-4.6-1.9-6.6.5C-.6 8.5.4 14.6 3.6 19.7c1.6 2.5 3.7 5.3 6.5 5.2 2.6-.1 3.6-1.7 6.7-1.7 3.1 0 4 1.7 6.7 1.6 2.8-.1 4.6-2.6 6.3-5.1 1.9-2.9 2.7-5.7 2.7-5.9-.1 0-5.2-2-5.3-7.9 0-4.9 4-7.3 4.2-7.4-2.3-3.4-5.9-3.8-7.2-3.9-3.3-.3-6 1.9-7.5 1.9z" />
          </svg>
          <h1>Wander</h1>
        </div>

        <div className={styles.hero}>
          <h2>Welcome to Wander</h2>
          <p>Plan trips, share with friends, get there.</p>
        </div>

        <div className={styles.buttons}>
          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: '/' });
            }}
          >
            <SubmitButton className={styles.btn} pendingText={<span>Redirecting…</span>}>
              <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden>
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z" />
                <path fill="#FBBC05" d="M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.34z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
              </svg>
              <span>Continue with Google</span>
            </SubmitButton>
          </form>

          {hasEmail ? (
            <form
              action={async (formData: FormData) => {
                'use server';
                await signIn('nodemailer', { email: formData.get('email'), redirectTo: '/' });
              }}
              className={styles.emailForm}
            >
              <input
                type="email"
                name="email"
                required
                placeholder="name@example.com"
                className={styles.emailInput}
              />
              <SubmitButton className={styles.btn} pendingText={<span>Sending link…</span>}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
                <span>Continue with email</span>
              </SubmitButton>
            </form>
          ) : (
            <button type="button" className={styles.btn} disabled title="EMAIL_SERVER not configured">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
              <span>Continue with email</span>
            </button>
          )}
        </div>

        <p className={styles.terms}>
          By continuing you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
