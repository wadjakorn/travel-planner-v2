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
import { hashInviteToken } from '@/lib/services/invite-service';
import { consumeAnonBudget } from '@/lib/anon-rate-limit';
import { normalizeEmail, maskEmail } from '@/lib/access-policy';
import { signOutAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Accept invite' };

type Params = Promise<{ token: string }>;

type InviteResult =
  | { state: 'missing' }
  | { state: 'unavailable'; status: string }
  | { state: 'expired' }
  | { state: 'wrong-account'; maskedEmail: string }
  | {
      state: 'ok';
      role: string;
      tripTitle: string;
      invitedByLabel: string;
    };

// The lookup and every "is this link still usable" decision live here rather
// than in the component: reading the clock is not something a render may do,
// and the page only needs the verdict.
async function loadInvite(
  token: string,
  viewerEmail: string | null | undefined,
): Promise<InviteResult> {
  const tokenHash = await hashInviteToken(token);
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
  if (!r) return { state: 'missing' };

  const inv = r.invite;
  if (inv.status !== 'pending') return { state: 'unavailable', status: inv.status };
  if (inv.expiresAt.getTime() < Date.now()) return { state: 'expired' };

  // UI only — acceptInviteAction re-checks this and is the actual gate.
  // Same normaliser as the registration gate, so the address that let someone
  // sign up and the address checked here normalise identically.
  const viewer = normalizeEmail(viewerEmail);
  if (!viewer || viewer !== normalizeEmail(inv.email)) {
    return { state: 'wrong-account', maskedEmail: maskEmail(inv.email) };
  }

  return {
    state: 'ok',
    role: inv.role,
    tripTitle: r.tripTitle,
    invitedByLabel: r.ownerName ?? r.ownerEmail ?? 'A collaborator',
  };
}

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    // Anonymous token guessing is the flood surface here; a signed-in
    // visitor is never limited (TP-0031, plan §3.4).
    const budget = await consumeAnonBudget('join');
    if (!budget.ok) {
      return (
        <Shell>
          <h1 className="mb-2 text-2xl font-semibold">Too many requests</h1>
          <p className="text-zinc-500">
            Try again in about {Math.ceil(budget.retryAfter / 60)} minute(s).
          </p>
        </Shell>
      );
    }
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const result = await loadInvite(token, session.user.email);

  if (result.state === 'missing') {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-semibold">Invite not found</h1>
        <p className="text-zinc-500">
          The link is invalid or has already been used.
        </p>
      </Shell>
    );
  }
  if (result.state === 'unavailable') {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-semibold">Invite unavailable</h1>
        <p className="text-zinc-500">Status: {result.status}.</p>
      </Shell>
    );
  }
  if (result.state === 'wrong-account') {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-semibold">Wrong account</h1>
        <p className="text-zinc-500">
          This invite was issued to {result.maskedEmail}, not the account
          you&apos;re signed in with. Sign out and sign back in with the invited
          address, or ask the trip owner to send a new invite to the address you
          actually use.
        </p>
        <form action={signOutAction} className="mt-5">
          <button
            type="submit"
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Sign out
          </button>
        </form>
      </Shell>
    );
  }
  if (result.state === 'expired') {
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
        {result.tripTitle}
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        {result.invitedByLabel} added you as <strong>{result.role}</strong>.
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
