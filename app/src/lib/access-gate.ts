// Invite-only registration gate (TP-0031). Answers one question for
// callbacks.signIn in lib/auth.ts: may this sign-in attempt proceed?
//
// Plan: ../../../docs/plans/invite-only-access.md §2.5, §3.1.
//
// A grant is derived, never backfilled — there is no "grandfathered users"
// table to drift. In order:
//
//   1. An `account` row already exists for (provider, providerAccountId).
//      This is the exact condition under which @auth/core itself resolved
//      `userByAccount`, and it is independent of email — `user.email` is
//      nullable (schema.ts:33), so an email-only check would lock out any
//      existing user whose row has none.
//   2. A `user` row exists with this (lowercased) email.
//   3. The address is in ACCESS_ALLOWLIST.
//   4. A pending, unexpired trip invite exists for the address — otherwise
//      turning the flag on would turn every outstanding collaborator invite
//      into a dead link.
//
// The allowlist is the invite mechanism this phase: adding an address to the
// Vercel env var *is* the invite. An account-level `access_invite` table with
// self-service links is the documented upgrade path; `hasGrant`'s signature
// does not change when it lands.

import 'server-only';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, invites, users } from '@/db/schema';
import { normalizeEmail, parseAllowlist, isAllowlisted } from './access-policy';

// Read once at module load, like FEATURE_FLAGS — changing it needs a redeploy.
export const ACCESS_ALLOWLIST = parseAllowlist(process.env.ACCESS_ALLOWLIST);

export type GrantSource =
  | 'existing-account'
  | 'existing-user'
  | 'allowlist'
  | 'trip-invite'
  | null;

export type AccountKey = {
  provider: string | null | undefined;
  providerAccountId: string | null | undefined;
};

async function hasLinkedAccount(key: AccountKey): Promise<boolean> {
  if (!key.provider || !key.providerAccountId) return false;
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, key.provider),
        eq(accounts.providerAccountId, key.providerAccountId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function hasUserRow(email: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  return rows.length > 0;
}

async function hasPendingTripInvite(email: string): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(invites)
    .where(
      and(
        sql`lower(${invites.email}) = ${email}`,
        eq(invites.status, 'pending'),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Returns why access is granted, or null when the attempt must be rejected.
// The reason is returned rather than a boolean so the caller can log which
// rule fired without re-running the queries.
export async function grantSource(
  rawEmail: string | null | undefined,
  account?: AccountKey,
): Promise<GrantSource> {
  // An already-linked OAuth account is checked before the email so a user
  // with a null `user.email` is never locked out.
  if (account && (await hasLinkedAccount(account))) return 'existing-account';

  const email = normalizeEmail(rawEmail);
  if (!email) return null;

  if (await hasUserRow(email)) return 'existing-user';
  if (isAllowlisted(email, ACCESS_ALLOWLIST)) return 'allowlist';
  if (await hasPendingTripInvite(email)) return 'trip-invite';
  return null;
}

export async function hasGrant(
  rawEmail: string | null | undefined,
  account?: AccountKey,
): Promise<boolean> {
  return (await grantSource(rawEmail, account)) !== null;
}
