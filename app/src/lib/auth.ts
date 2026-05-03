// Auth.js (NextAuth v5) config.
//
// Spec: ../../REQUIREMENTS.md §11. Decisions: ../../ARCHITECTURE.md
// "Auth - Auth.js (NextAuth) v5".
//
// Email magic-link is wired only when EMAIL_SERVER is set so local dev
// without an SMTP catcher still boots. Phase 8 locks in a real provider.

import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'database' },
  pages: {
    signIn: '/sign-in',
    error: '/sign-in/error',
    verifyRequest: '/sign-in/verify-request',
  },
  providers,
});
