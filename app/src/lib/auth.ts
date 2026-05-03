// Auth.js (NextAuth v5) config. Phase 1 wires real flows; Phase 0 ships
// the minimum so the app builds and routes exist.
//
// Spec: ../../REQUIREMENTS.md §11. Decisions: ../../ARCHITECTURE.md
// "Auth - Auth.js (NextAuth) v5".

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Email from 'next-auth/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'database' },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Email({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  ],
});
