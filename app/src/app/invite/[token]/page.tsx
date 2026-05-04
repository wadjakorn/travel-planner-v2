// /invite/[token] — public landing for an invite link. Shows trip name +
// inviter and a single Accept button (POSTs to acceptInviteAction).
// Bounces to sign-in if user is anonymous.

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { invites, trips, users } from '@/db/schema';
import { acceptInviteAction } from '@/app/actions/invites';

export const metadata: Metadata = { title: 'Accept invite' };

type Params = Promise<{ token: string }>;

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const tokenHash = await hashToken(token);
  const row = await db
    .select({
      invite: invites,
      tripTitle: trips.title,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(invites)
    .innerJoin(trips, eq(trips.id, invites.tripId))
    .leftJoin(users, eq(users.id, invites.invitedBy))
    .where(eq(invites.tokenHash, tokenHash))
    .limit(1);

  const r = row[0];
  if (!r) {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-semibold">Invite not found</h1>
        <p className="text-zinc-500">
          The link is invalid or has already been used.
        </p>
      </Shell>
    );
  }

  const inv = r.invite;
  if (inv.status !== 'pending') {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-semibold">Invite unavailable</h1>
        <p className="text-zinc-500">Status: {inv.status}.</p>
      </Shell>
    );
  }
  if (inv.expiresAt.getTime() < Date.now()) {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-semibold">Invite expired</h1>
        <p className="text-zinc-500">Ask the trip owner for a fresh link.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        You&apos;re invited
      </div>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {r.tripTitle}
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        {r.ownerName ?? r.ownerEmail ?? 'A collaborator'} added you as{' '}
        <strong>{inv.role}</strong>.
      </p>
      <form action={acceptInviteAction} className="mt-5">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Accept &amp; join
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        {children}
      </div>
    </main>
  );
}
