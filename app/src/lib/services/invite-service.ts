// Accept-invite logic, split out of the server action so it can take an
// executor and be integration-tested. The action keeps only the parts a
// service must not own: redirect() and revalidatePath().
//
// This split exists for one reason: the costly failure mode of the exact-email
// rule (TP-0032 §3.8) is a *half-applied* accept — a membership row written but
// the status left behind, or vice versa. Asserting that requires driving the
// real writes against a real database, which the module-level `db` import made
// impossible.

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { invites, tripMemberships, trips } from '@/db/schema';
import { normalizeEmail } from '@/lib/access-policy';
import type { IdemExecutor } from '@/lib/api/idempotency';

export type AcceptInviteResult =
  | { ok: true; tripId: string }
  | {
      ok: false;
      reason: 'invalid' | 'unavailable' | 'expired' | 'wrong-email' | 'trip-missing';
    };

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
