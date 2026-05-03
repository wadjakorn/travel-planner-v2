// Phase 1 placeholder home. Renders the new app-shell header
// (AccountMenu + SettingsModal) for signed-in users; route-gating
// middleware redirects unauthenticated users to /sign-in.
//
// Phase 2+ replaces the body with the itinerary view.

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Header } from '@/components/header';

export default async function Home() {
  const session = await auth();
  const user = session?.user;
  // Phase 1: each protected route gates itself. Edge-middleware gating is
  // deferred — Drizzle adapter pulls Node-only modules, so the Auth.js v5
  // split-config pattern + JWT session strategy would be needed. Revisit
  // when more routes exist (Phase 2+).
  if (!user) redirect('/sign-in');

  return (
    <>
      <Header user={user} />

      <main className="mx-auto flex max-w-2xl flex-col items-start gap-6 px-8 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">Travel Planner</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Signed in as <strong>{user.email}</strong>.
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Phase 1 scaffold. Itinerary, hotels, transport, calendar, budget,
          notes — wiring up next per ROADMAP.md.
        </p>

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
          </code>
          .
        </p>
      </main>
    </>
  );
}
