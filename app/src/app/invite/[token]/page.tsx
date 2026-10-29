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
import { interpolate, tServer, type MessageKey } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer();
  return { title: t('invite_meta_title') };
}

// Roles render lowercase mid-sentence ("added you as editor").
const ROLE_KEY: Partial<Record<string, MessageKey>> = {
  editor: 'invite_role_editor',
  viewer: 'invite_role_viewer',
};

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
      // null → the page shows its translated "A collaborator".
      invitedByLabel: string | null;
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
    invitedByLabel: r.ownerName ?? r.ownerEmail ?? null,
  };
}

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const [session, t] = await Promise.all([auth(), tServer()]);

  if (!session?.user?.id) {
    // Anonymous token guessing is the flood surface here; a signed-in
    // visitor is never limited (TP-0031, plan §3.4).
    const budget = await consumeAnonBudget('join');
    if (!budget.ok) {
      return (
        <Shell>
          <h1 className="mb-2 text-2xl font-semibold">{t('err_rate_limited_title')}</h1>
          <p className="text-muted">
            {t('err_rate_limited_body', { n: Math.ceil(budget.retryAfter / 60) })}
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
        <h1 className="mb-2 text-2xl font-semibold">{t('invite_not_found_title')}</h1>
        <p className="text-muted">{t('invite_not_found_body')}</p>
      </Shell>
    );
  }
  if (result.state === 'unavailable') {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-semibold">{t('invite_unavailable_title')}</h1>
        <p className="text-muted">{t('invite_unavailable_body', { status: result.status })}</p>
      </Shell>
    );
  }
  if (result.state === 'wrong-account') {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-semibold">{t('invite_wrong_account_title')}</h1>
        <p className="text-muted">
          {t('invite_wrong_account_body', { email: result.maskedEmail })}
        </p>
        <form action={signOutAction} className="mt-5">
          <button
            type="submit"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            {t('sign_out')}
          </button>
        </form>
      </Shell>
    );
  }
  if (result.state === 'expired') {
    return (
      <Shell>
        <h1 className="mb-2 text-2xl font-semibold">{t('invite_expired_title')}</h1>
        <p className="text-muted">{t('invite_expired_body')}</p>
      </Shell>
    );
  }

  // One sentence with the role in <strong>: split the translated template
  // around {role} (Thai word order), then fill {name} into each half, so an
  // owner name that itself contains "{role}" can't break the split.
  const nameVars = { name: result.invitedByLabel ?? t('invite_by_fallback') };
  const [beforeRole, afterRole = ''] = t('invite_added_you_as')
    .split('{role}')
    .map((part) => interpolate(part, nameVars));
  const roleKey = ROLE_KEY[result.role];

  return (
    <Shell>
      <div className="text-xs uppercase tracking-wide text-muted">
        {t('invite_eyebrow')}
      </div>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">
        {result.tripTitle}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {beforeRole}
        <strong>{roleKey ? t(roleKey) : result.role}</strong>
        {afterRole}
      </p>
      <form action={acceptInviteAction} className="mt-5">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          {t('invite_accept')}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-2xl border border-border bg-surface p-6">
        {children}
      </div>
    </main>
  );
}
