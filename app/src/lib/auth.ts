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
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings, users } from '@/db/schema';
import { LANG_COOKIE, LANG_COOKIE_OPTIONS } from './lang-resolve';
import { isLang } from './landing-lang';
import { FEATURE_FLAGS } from './feature-flags';
import { hasGrant } from './access-gate';

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

// Where a rejected sign-in lands. The gate returns this path as a *string*,
// never `false`: @auth/core throws AccessDenied on a falsy return, and the
// sign-in page drives both providers from server actions, which call Auth()
// in `raw` mode (next-auth/lib/actions.js) — there the thrown error escapes
// into Next's error boundary (app/error.tsx) instead of reaching
// pages.error. A string is passed to callbacks.redirect and becomes a clean
// redirect on both the server-action and the HTTP callback leg.
// See docs/plans/invite-only-access.md §2.1.
export const NOT_INVITED_PATH = '/sign-in/not-invited';

const nextAuth = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'database' },
  pages: {
    signIn: '/sign-in',
    error: '/sign-in/error',
    verifyRequest: '/sign-in/verify-request',
  },
  callbacks: {
    // Invite-only gate (TP-0031). Runs before any `user` row is created
    // (OAuth: callback/index.js calls handleAuthorized before
    // handleLoginOrRegister) and before any magic link is sent
    // (signin/send-token.js calls it before generating the token) — so a
    // rejected address leaves no trace and receives no email.
    //
    // Note: with AUTH_BYPASS=true `auth()` never consults Auth.js at all, so
    // this gate does not apply in that dev mode. Intended.
    async signIn({ user, account, profile }) {
      if (!FEATURE_FLAGS.inviteOnly) return true;

      // Google verifies its addresses, but Auth.js maps profile.email
      // without inspecting the claim. Requiring it keeps an unverified
      // address from matching an allowlisted one.
      if (account?.provider === 'google' && profile?.email_verified !== true) {
        return NOT_INVITED_PATH;
      }

      const allowed = await hasGrant(user?.email, account ?? undefined);
      return allowed ? true : NOT_INVITED_PATH;
    },
  },
  events: {
    // The rendered language comes from the `lang` cookie (i18n Decision 3), so
    // the account's saved Language would not follow the user to a new device.
    // Sign-in copies it over, but only onto a device with no `lang` cookie
    // yet: a cookie already there is this browser's own pick (the landing's
    // EN/ไทย switch, whose promise is that the pick carries over, or an earlier
    // Settings save) and wins. That also keeps pre-P6 rows, which all hold
    // the hidden input's default 'en', from undoing a ไทย pick at every
    // sign-in. Runs in the /api/auth/callback route handler, whose response
    // Next merges cookies() writes into. No row (Language never saved) leaves
    // a cookie-less device on Accept-Language.
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        const jar = await cookies();
        if (isLang(jar.get(LANG_COOKIE)?.value)) return;
        const [row] = await db
          .select({ lang: userSettings.lang })
          .from(userSettings)
          .where(eq(userSettings.userId, user.id))
          .limit(1);
        if (row) jar.set(LANG_COOKIE, row.lang, LANG_COOKIE_OPTIONS);
      } catch (err) {
        // Never fail a sign-in over a display preference.
        console.error('[auth] lang cookie seed failed', err);
      }
    },
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
