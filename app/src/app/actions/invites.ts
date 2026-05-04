'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { invites, tripMemberships, trips } from '@/db/schema';
import { getTripRole, canManageInvites } from '@/lib/trip-access';
import { writeAudit } from '@/lib/audit';

const INVITE_TTL_DAYS = 14;

function generateToken(): string {
  // 32 bytes → 64 hex chars. Web Crypto only — works on Edge + Node.
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export async function createInviteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const tripId = String(formData.get('tripId') ?? '');
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const role = String(formData.get('role') ?? 'editor') as 'editor' | 'viewer';
  if (!email || !email.includes('@')) throw new Error('Invalid email');

  const myRole = await getTripRole(tripId, session.user.id);
  if (!canManageInvites(myRole)) throw new Error('Forbidden');

  const token = generateToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const [created] = await db
    .insert(invites)
    .values({
      tripId,
      email,
      role,
      tokenHash,
      invitedBy: session.user.id,
      expiresAt,
    })
    .returning({ id: invites.id });

  await writeAudit({
    tripId,
    userId: session.user.id,
    action: 'add',
    entityType: 'invite',
    entityId: created.id,
    after: { email, role },
  });

  // Email send deferred — caller copies link from settings page.
  revalidatePath(`/trip/${tripId}/settings`);
  redirect(`/trip/${tripId}/settings?invited=${encodeURIComponent(token)}`);
}

export async function revokeInviteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');

  const inviteId = String(formData.get('inviteId') ?? '');
  const row = await db
    .select({ tripId: invites.tripId })
    .from(invites)
    .where(eq(invites.id, inviteId))
    .limit(1);
  if (!row[0]) throw new Error('Not found');

  const myRole = await getTripRole(row[0].tripId, session.user.id);
  if (!canManageInvites(myRole)) throw new Error('Forbidden');

  await db
    .update(invites)
    .set({ status: 'revoked' })
    .where(eq(invites.id, inviteId));
  await writeAudit({
    tripId: row[0].tripId,
    userId: session.user.id,
    action: 'remove',
    entityType: 'invite',
    entityId: inviteId,
  });
  revalidatePath(`/trip/${row[0].tripId}/settings`);
}

export async function acceptInviteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    // Bounce to sign-in; preserve token in callback.
    const token = String(formData.get('token') ?? '');
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const token = String(formData.get('token') ?? '');
  if (!token) throw new Error('Missing token');
  const tokenHash = await hashToken(token);

  const row = await db
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, tokenHash))
    .limit(1);
  const inv = row[0];
  if (!inv) throw new Error('Invalid invite');
  if (inv.status !== 'pending') throw new Error('Invite no longer valid');
  if (inv.expiresAt.getTime() < Date.now()) {
    await db
      .update(invites)
      .set({ status: 'expired' })
      .where(eq(invites.id, inv.id));
    throw new Error('Invite expired');
  }

  // Skip self-invite for owner.
  const tripRow = await db
    .select({ ownerId: trips.ownerId })
    .from(trips)
    .where(eq(trips.id, inv.tripId))
    .limit(1);
  if (!tripRow[0]) throw new Error('Trip missing');

  if (tripRow[0].ownerId !== session.user.id) {
    // Upsert membership.
    const existing = await db
      .select({ id: tripMemberships.id })
      .from(tripMemberships)
      .where(
        and(
          eq(tripMemberships.tripId, inv.tripId),
          eq(tripMemberships.userId, session.user.id),
        ),
      )
      .limit(1);
    if (!existing[0]) {
      await db.insert(tripMemberships).values({
        tripId: inv.tripId,
        userId: session.user.id,
        role: inv.role,
      });
    } else {
      await db
        .update(tripMemberships)
        .set({ role: inv.role })
        .where(eq(tripMemberships.id, existing[0].id));
    }
  }

  await db
    .update(invites)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(eq(invites.id, inv.id));

  revalidatePath(`/trip/${inv.tripId}`);
  redirect(`/trip/${inv.tripId}`);
}

