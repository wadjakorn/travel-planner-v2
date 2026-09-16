'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { requireUserId } from '@/lib/with-trip-auth';
import { db } from '@/db';
import { invites } from '@/db/schema';
import { getTripRole, canManageInvites } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';
import {
  acceptInvite,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  regenerateInviteToken,
} from '@/lib/services/invite-service';

export async function createInviteAction(formData: FormData) {
  const userId = await requireUserId();

  const tripId = String(formData.get('tripId') ?? '');
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const role = String(formData.get('role') ?? 'editor') as 'editor' | 'viewer';
  if (!email || !email.includes('@')) throw new Error('Invalid email');

  const myRole = await getTripRole(tripId, userId);
  if (!canManageInvites(myRole)) throw new Error('Forbidden');

  const token = generateInviteToken();
  const tokenHash = await hashInviteToken(token);
  const expiresAt = inviteExpiry();

  const [created] = await db
    .insert(invites)
    .values({
      tripId,
      email,
      role,
      tokenHash,
      invitedBy: userId,
      expiresAt,
    })
    .returning({ id: invites.id });

  await writeAudit({
    tripId,
    userId,
    action: 'add',
    entityType: 'invite',
    entityId: created.id,
    after: { email, role },
  });

  // Email send deferred — caller copies link from settings page.
  revalidatePath(`/trip/${tripId}/settings`);
  // keep ?s= so the folio does not snap back to the first section
  redirect(
    `/trip/${tripId}/settings?s=people&invited=${encodeURIComponent(token)}`,
  );
}

export async function revokeInviteAction(formData: FormData) {
  const userId = await requireUserId();

  const inviteId = String(formData.get('inviteId') ?? '');
  const row = await db
    .select({ tripId: invites.tripId })
    .from(invites)
    .where(eq(invites.id, inviteId))
    .limit(1);
  if (!row[0]) throw new Error('Not found');

  const myRole = await getTripRole(row[0].tripId, userId);
  if (!canManageInvites(myRole)) throw new Error('Forbidden');

  await db
    .update(invites)
    .set({ status: 'revoked' })
    .where(eq(invites.id, inviteId));
  await writeAudit({
    tripId: row[0].tripId,
    userId,
    action: 'remove',
    entityType: 'invite',
    entityId: inviteId,
  });
  revalidatePath(`/trip/${row[0].tripId}/settings`);
}

export async function regenerateInviteAction(formData: FormData) {
  const userId = await requireUserId();

  const inviteId = String(formData.get('inviteId') ?? '');
  const row = await db
    .select({ tripId: invites.tripId })
    .from(invites)
    .where(eq(invites.id, inviteId))
    .limit(1);
  if (!row[0]) throw new Error('Not found');

  // Same gate as revoke: without it, anyone who guessed an invite id could mint
  // themselves a working link into someone else's trip.
  const myRole = await getTripRole(row[0].tripId, userId);
  if (!canManageInvites(myRole)) throw new Error('Forbidden');

  const result = await regenerateInviteToken({ inviteId });
  if (!result.ok) {
    throw new Error(
      result.reason === 'not-found'
        ? 'Not found'
        : 'This invite can no longer be re-issued',
    );
  }

  await writeAudit({
    tripId: result.tripId,
    userId,
    action: 'update',
    entityType: 'invite',
    entityId: inviteId,
  });

  revalidatePath(`/trip/${result.tripId}/settings`);
  // Hand the new token back the same way createInviteAction does, so it lands
  // in the one reveal block that can show it.
  redirect(
    `/trip/${result.tripId}/settings?s=people&invited=${encodeURIComponent(result.token)}`,
  );
}

export async function acceptInviteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    // Bounce to sign-in; preserve token in callback. /sign-in reads this
    // (TP-0032) — before that fix the param was dropped and the invitee landed
    // on the home page with no membership row ever written.
    const token = String(formData.get('token') ?? '');
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const token = String(formData.get('token') ?? '');
  if (!token) throw new Error('Missing token');

  const result = await acceptInvite({
    userId: session.user.id,
    email: session.user.email,
    token,
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'invalid':
        throw new Error('Invalid invite');
      case 'unavailable':
        throw new Error('Invite no longer valid');
      case 'expired':
        throw new Error('Invite expired');
      case 'wrong-email':
        throw new Error('This invite was issued to a different email address');
      case 'trip-missing':
        throw new Error('Trip missing');
    }
  }

  revalidatePath(`/trip/${result.tripId}`);
  redirect(`/trip/${result.tripId}`);
}
