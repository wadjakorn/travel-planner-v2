// Accept-invite logic, split out of the server action so it can take an
// executor and be integration-tested. The action keeps only the parts a
// service must not own: redirect() and revalidatePath().
//
// This split exists for one reason: the costly failure mode of the exact-email
// rule (TP-0032 §3.8) is a *half-applied* accept — a membership row written but
// the status left behind, or vice versa. Asserting that requires driving the
// real writes against a real database, which the module-level `db` import made
// impossible.

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { invites, tripMemberships, trips, users } from '@/db/schema';
import { canManageInvites, getTripRoleWith } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';
import { ServiceError } from './service-error';
import { requireTripAccess } from './access';
import { normalizeEmail } from '@/lib/access-policy';
import type { IdemExecutor } from '@/lib/api/idempotency';

export type AcceptInviteResult =
  | { ok: true; tripId: string }
  | {
      ok: false;
      reason: 'invalid' | 'unavailable' | 'expired' | 'wrong-email' | 'trip-missing';
    };

// TTL and token minting live beside hashInviteToken so the value that sets
// expires_at and the value that checks it can never drift apart. Both
// createInviteAction and regenerateInviteToken read them from here.
export const INVITE_TTL_DAYS = 14;

export function inviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function generateInviteToken(): string {
  // 32 bytes -> 64 hex chars. Web Crypto only - works on Edge + Node.
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashInviteToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export async function acceptInvite(
  input: { userId: string; email: string | null | undefined; token: string },
  exec: IdemExecutor = db,
): Promise<AcceptInviteResult> {
  const tokenHash = await hashInviteToken(input.token);

  const row = await exec
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, tokenHash))
    .limit(1);
  const inv = row[0];
  if (!inv) return { ok: false, reason: 'invalid' };
  if (inv.status !== 'pending') return { ok: false, reason: 'unavailable' };
  if (inv.expiresAt.getTime() < Date.now()) {
    await exec
      .update(invites)
      .set({ status: 'expired' })
      .where(eq(invites.id, inv.id));
    return { ok: false, reason: 'expired' };
  }

  // An invite is bound to an identity, not a bearer token: whoever holds the
  // link may not join under a different address. This runs before every write,
  // so a mismatch leaves trip_membership and invite.status untouched.
  //
  // users.email is nullable, so a null address must FAIL rather than pass via
  // '' === '' — hence the explicit empty guard. normalizeEmail is the same
  // function the registration gate uses, so the address that let someone sign
  // up and the address checked here normalise identically.
  const sessionEmail = normalizeEmail(input.email);
  if (!sessionEmail || sessionEmail !== normalizeEmail(inv.email)) {
    return { ok: false, reason: 'wrong-email' };
  }

  const tripRow = await exec
    .select({ ownerId: trips.ownerId })
    .from(trips)
    .where(eq(trips.id, inv.tripId))
    .limit(1);
  if (!tripRow[0]) return { ok: false, reason: 'trip-missing' };

  // Skip self-invite for the owner: they already have full access.
  if (tripRow[0].ownerId !== input.userId) {
    const existing = await exec
      .select({ id: tripMemberships.id })
      .from(tripMemberships)
      .where(
        and(
          eq(tripMemberships.tripId, inv.tripId),
          eq(tripMemberships.userId, input.userId),
        ),
      )
      .limit(1);
    if (!existing[0]) {
      await exec.insert(tripMemberships).values({
        tripId: inv.tripId,
        userId: input.userId,
        role: inv.role,
      });
    } else {
      await exec
        .update(tripMemberships)
        .set({ role: inv.role })
        .where(eq(tripMemberships.id, existing[0].id));
    }
  }

  await exec
    .update(invites)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(eq(invites.id, inv.id));

  return { ok: true, tripId: inv.tripId };
}

export type RegenerateInviteResult =
  | { ok: true; token: string; tripId: string }
  | { ok: false; reason: 'not-found' | 'unavailable' };

// Re-issue the link for an invite whose plaintext token is gone. Only the hash
// is stored (schema.ts), so there is nothing to "resend" - the only honest move
// is to mint a new token, which invalidates whatever link was sent before. The
// caller's UI has to say so.
//
// Authorisation is NOT done here: the action layer owns it, the same way
// revokeInviteAction does. This function assumes the caller already checked.
export async function regenerateInviteToken(
  input: { inviteId: string },
  exec: IdemExecutor = db,
): Promise<RegenerateInviteResult> {
  const row = await exec
    .select({
      id: invites.id,
      tripId: invites.tripId,
      status: invites.status,
    })
    .from(invites)
    .where(eq(invites.id, input.inviteId))
    .limit(1);
  const inv = row[0];
  if (!inv) return { ok: false, reason: 'not-found' };

  // Only a live invite may be re-issued. Reviving a revoked or already-accepted
  // one would hand out access the owner deliberately ended, and an 'expired'
  // row means someone already tried and failed - reopening it silently would
  // undo that record.
  if (inv.status !== 'pending') return { ok: false, reason: 'unavailable' };

  const token = generateInviteToken();

  // expires_at is reset as well, not just the hash: the main reason to re-issue
  // is that the old link ran out of time, and a fresh token on a stale deadline
  // would be dead the moment it is handed over.
  await exec
    .update(invites)
    .set({ tokenHash: await hashInviteToken(token), expiresAt: inviteExpiry() })
    .where(eq(invites.id, inv.id));

  return { ok: true, token, tripId: inv.tripId };
}

// ---------------------------------------------------------------------------
// Members + invites for the People section and /api/v1 ([API-MEM]). One
// permission check for both callers: members are visible to anyone who can
// read the trip; invites are the owner's (canManageInvites).

export type MemberView = { userId: string; name: string | null; email: string | null; image: string | null };
export type InviteRole = 'editor' | 'viewer';
const INVITE_ROLES: InviteRole[] = ['editor', 'viewer'];

async function requireInviteManager(userId: string, tripId: string, exec: IdemExecutor): Promise<void> {
  const role = await getTripRoleWith(tripId, userId, exec);
  if (role === null) throw new ServiceError('not_found', 'Trip not found');
  if (!canManageInvites(role)) throw new ServiceError('forbidden', 'Only the trip owner can manage invites');
}

export async function listMembers(
  userId: string,
  tripId: string,
  exec: IdemExecutor = db,
): Promise<{ owner: MemberView | null; members: (MemberView & { role: string })[] }> {
  await requireTripAccess(userId, tripId, 'read', exec);
  const cols = { userId: users.id, name: users.name, email: users.email, image: users.image };
  const [owner] = await exec.select(cols).from(trips).innerJoin(users, eq(users.id, trips.ownerId)).where(eq(trips.id, tripId)).limit(1);
  const members = await exec
    .select({ ...cols, role: tripMemberships.role })
    .from(tripMemberships)
    .innerJoin(users, eq(users.id, tripMemberships.userId))
    .where(eq(tripMemberships.tripId, tripId));
  return { owner: owner ?? null, members };
}

export async function listInvites(userId: string, tripId: string, exec: IdemExecutor = db) {
  await requireInviteManager(userId, tripId, exec);
  return exec
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      status: invites.status,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
    })
    .from(invites)
    .where(eq(invites.tripId, tripId))
    .orderBy(desc(invites.createdAt));
}

/** Owner only. Returns the plaintext token once; only its hash is stored. */
export async function createInvite(
  userId: string,
  tripId: string,
  input: { email: unknown; role?: unknown },
  exec: IdemExecutor = db,
): Promise<{ invite: { id: string; email: string; role: InviteRole; expiresAt: Date }; token: string }> {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) throw new ServiceError('bad_request', '"email" must be an email address');
  const role = (input.role ?? 'editor') as InviteRole;
  if (!INVITE_ROLES.includes(role)) throw new ServiceError('bad_request', '"role" must be "editor" or "viewer"');
  await requireInviteManager(userId, tripId, exec);

  const token = generateInviteToken();
  const expiresAt = inviteExpiry();
  const [created] = await (exec as typeof db)
    .insert(invites)
    .values({ tripId, email, role, tokenHash: await hashInviteToken(token), invitedBy: userId, expiresAt })
    .returning({ id: invites.id });
  await writeAudit({ tripId, userId, action: 'add', entityType: 'invite', entityId: created.id, after: { email, role } });
  return { invite: { id: created.id, email, role, expiresAt }, token };
}

/** Owner of the invite's trip only; "not found" also covers "not yours". */
export async function revokeInvite(userId: string, inviteId: string, exec: IdemExecutor = db): Promise<{ tripId: string }> {
  const [row] = await exec.select({ tripId: invites.tripId }).from(invites).where(eq(invites.id, inviteId)).limit(1);
  if (!row) throw new ServiceError('not_found', 'Invite not found');
  const role = await getTripRoleWith(row.tripId, userId, exec);
  if (!canManageInvites(role)) throw new ServiceError('not_found', 'Invite not found');
  await (exec as typeof db).update(invites).set({ status: 'revoked' }).where(eq(invites.id, inviteId));
  await writeAudit({ tripId: row.tripId, userId, action: 'remove', entityType: 'invite', entityId: inviteId });
  return { tripId: row.tripId };
}
