// Phase 0 placeholder. Phase 1+ replaces this with the real app shell.
//
// The static prototype the real app is being rebuilt from lives at
// http://localhost:3001 (run `npx serve design -l 3001` from repo root).
// See ../../../REQUIREMENTS.md for the spec.

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-8 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">
        Travel Planner
      </h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Phase 0 scaffold. Real app under construction per{' '}
        <a
          href="https://github.com/"
          className="underline decoration-dotted underline-offset-4"
        >
          ROADMAP.md
        </a>
        .
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
