// Phase 0/1 placeholder home. Phase 1 gates the real app shell behind
// auth. Phase 2+ replaces this with the itinerary view.

import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-8 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Travel Planner</h1>

      {session?.user ? (
        <>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Signed in as <strong>{session.user.email}</strong>.
          </p>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/sign-in' });
            }}
          >
            <button
              type="submit"
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm hover:border-zinc-900 dark:border-zinc-700 dark:hover:border-zinc-50"
            >
              Sign out
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Phase 0 scaffold. Real app under construction per ROADMAP.md.
          </p>
          <Link
            href="/sign-in"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Sign in
          </Link>
        </>
      )}

      <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        <li>Frontend: Next.js 16 (App Router) + Tailwind v4</li>
        <li>Database: Postgres on Neon · Drizzle ORM</li>
        <li>Auth: Auth.js (Google + Email magic-link)</li>
        <li>Maps: Google Maps</li>
      </ul>

      <p className="mt-6 text-sm text-zinc-500">
        Mockup served at{' '}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
          http://localhost:3001
        </code>{' '}
        — read{' '}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
          /design
        </code>{' '}
        for source.
      </p>
    </main>
  );
}
