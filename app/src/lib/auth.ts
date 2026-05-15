// Auth.js (NextAuth v5) config.
//
// Spec: ../../REQUIREMENTS.md §11. Decisions: ../../ARCHITECTURE.md
// "Auth - Auth.js (NextAuth) v5".
//
// Email magic-link is wired only when EMAIL_SERVER is set so local dev
// without an SMTP catcher still boots. Phase 8 locks in a real provider.
//
// Dev bypass: when FEATURE_FLAGS.authBypass is true, `auth()` returns a
// fixed dev-user session without consulting Auth.js. The dev user row is
// upserted into `user` table on first call so foreign keys hold. Never
// enable in production.

import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';
import { users } from '@/db/schema';
import { FEATURE_FLAGS } from './feature-flags';

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }),
];

if (process.env.EMAIL_SERVER && process.env.EMAIL_FROM) {
  providers.push(
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  );
}

export const providerIds = providers
  .map((p) => (typeof p === 'function' ? p().id : p.id))
  .filter((id): id is string => Boolean(id));

const nextAuth = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'database' },
  pages: {
    signIn: '/sign-in',
    error: '/sign-in/error',
    verifyRequest: '/sign-in/verify-request',
  },
  providers,
});

export const { handlers, signIn, signOut } = nextAuth;

// ── Dev bypass ──────────────────────────────────────────────────────────────
// Fixed UUIDv4-shape id so it stays stable across restarts and any code
// path that joins on user.id keeps working.
const DEV_USER_ID = '00000000-0000-0000-0000-0000000d3000';
const DEV_USER_EMAIL = 'dev-bypass@local';
const DEV_USER_NAME = 'Dev User';

let bypassUserSeeded = false;
async function ensureBypassUser(): Promise<void> {
  if (bypassUserSeeded) return;
  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
    })
    .onConflictDoNothing({ target: users.id });
  bypassUserSeeded = true;
}

type AuthFn = typeof nextAuth.auth;

const bypassAuth = (async (...args: unknown[]) => {
  await ensureBypassUser();
  // Mirror the shape callers consume: `session?.user?.id` etc.
  // Cast to unknown then to AuthFn return so we don't pull in the full
  // overloaded NextAuth signature here.
  void args;
  return {
    user: { id: DEV_USER_ID, email: DEV_USER_EMAIL, name: DEV_USER_NAME },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}) as unknown as AuthFn;

export const auth: AuthFn = FEATURE_FLAGS.authBypass
  ? bypassAuth
  : nextAuth.auth;
