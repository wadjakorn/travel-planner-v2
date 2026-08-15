// Public landing for signed-out visitors (TP-0031, plan §3.3).
//
// Before this, `/` redirected anonymous visitors straight to /sign-in, so the
// production URL was unshareable — a link posted anywhere previewed as a bare
// sign-in wall. This page is what the real URL now shows: what the app is,
// what it looks like, and an honest note that sign-up is invite-only.
//
// FUTURE ENHANCE: the preview strip below is a styled mock, not real
// screenshots. Drop four images into /public and swap them in — the OG card
// (app/opengraph-image.tsx) should get the same treatment. A live read-only
// /demo trip is a separate follow-up (plan §3.3): the trip page threads
// mutation server actions through the itinerary tree, so a public variant is
// a parallel component tree, not a flag.

import Link from 'next/link';

const FEATURES = [
  {
    title: 'Itinerary',
    body: 'Day-by-day plan. Drag places into order, keep notes where you need them.',
  },
  {
    title: 'Map & routes',
    body: 'Every stop on one map, with real travel times between them.',
  },
  {
    title: 'Bookings & budget',
    body: 'Hotels, transport and expenses in the same place as the plan.',
  },
  {
    title: 'Together',
    body: 'Invite the people coming with you and edit the trip as a group.',
  },
];

export function PublicLanding() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="" width={36} height={36} className="rounded-lg" />
        <span className="text-lg font-semibold tracking-tight">Traver Planel</span>
      </div>

      <h1 className="mt-10 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Plan trips, share with friends, get there.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-zinc-500">
        One place for the itinerary, the map, the hotels and what it all costs —
        instead of six chat threads and a spreadsheet.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link
          href="/sign-in"
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Sign in
        </Link>
        <span className="text-sm text-zinc-500">
          New accounts are invite-only while we&apos;re in a small private phase.
        </span>
      </div>

      <div
        aria-hidden
        className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {['Itinerary', 'Calendar', 'Budget', 'Map'].map((label, i) => (
          <div
            key={label}
            className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-zinc-100 p-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950"
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              {label}
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 + (i % 2) }).map((_, row) => (
                <div
                  key={row}
                  className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800"
                  style={{ width: `${90 - row * 18}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 grid gap-8 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.title}>
            <h2 className="text-base font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{f.body}</p>
          </div>
        ))}
      </div>

      <p className="mt-16 text-xs text-zinc-500">
        Already have an account? <Link href="/sign-in" className="underline">Sign in</Link>.
      </p>
    </main>
  );
}
