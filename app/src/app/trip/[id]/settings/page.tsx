// /trip/[id]/settings — owner-only trip settings. Phase 8 ships invite
// management; later phases add appearance/privacy.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { eq, and, asc, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trips, invites, tripMemberships, users, auditLog } from '@/db/schema';
import { Header } from '@/components/header';
import { TripNav } from '@/components/trip-nav';
import {
  createInviteAction,
  revokeInviteAction,
} from '@/app/actions/invites';
import { Trash } from '@/components/icons';

export const metadata: Metadata = { title: 'Trip settings' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ invited?: string }>;

export default async function TripSettingsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;
  const { invited: justIssuedToken } = await searchParams;

  const tripRow = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const trip = tripRow[0];
  if (!trip || trip.ownerId !== user.id) notFound();

  const [pending, accepted, members, activity] = await Promise.all([
    db
      .select()
      .from(invites)
      .where(and(eq(invites.tripId, tripId), eq(invites.status, 'pending')))
      .orderBy(desc(invites.createdAt)),
    db
      .select()
      .from(invites)
      .where(and(eq(invites.tripId, tripId), eq(invites.status, 'accepted')))
      .orderBy(desc(invites.acceptedAt)),
    db
      .select({
        id: tripMemberships.id,
        role: tripMemberships.role,
        joinedAt: tripMemberships.joinedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(tripMemberships)
      .innerJoin(users, eq(users.id, tripMemberships.userId))
      .where(eq(tripMemberships.tripId, tripId))
      .orderBy(asc(tripMemberships.joinedAt)),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        at: auditLog.at,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(eq(auditLog.tripId, tripId))
      .orderBy(desc(auditLog.at))
      .limit(50),
  ]);

  const justIssuedUrl = justIssuedToken
    ? `${getOrigin()}/invite/${justIssuedToken}`
    : null;

  return (
    <>
      <Header
        user={user}
        tripTitle={trip.title}
        tripUpdatedAt={trip.updatedAt.toISOString()}
      />
      <TripNav tripId={tripId} active="settings" />
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Settings
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Trip settings
        </h1>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Invite collaborators
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Email send is offline for now. Copy the invite link from the row
            below and share it.
          </p>

          {justIssuedUrl ? (
            <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
              <div className="font-medium">Invite created</div>
              <div className="mt-1 break-all font-mono text-xs">
                {justIssuedUrl}
              </div>
            </div>
          ) : null}

          <form
            action={createInviteAction}
            className="mt-4 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="tripId" value={tripId} />
            <label className="flex-1 min-w-[220px]">
              <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Email
              </span>
              <input
                type="email"
                name="email"
                required
                placeholder="friend@example.com"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
            </label>
            <label>
              <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Role
              </span>
              <select
                name="role"
                defaultValue="editor"
                className="mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Send invite
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Pending invites
          </h2>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">None.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
              {pending.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {inv.email}
                    <span className="ml-2 text-xs text-zinc-500">
                      {inv.role} · expires{' '}
                      {inv.expiresAt.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </span>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="inviteId" value={inv.id} />
                    <button
                      type="submit"
                      aria-label="Revoke invite"
                      className="rounded-full p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <Trash width={14} height={14} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Members
          </h2>
          <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
            <li className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                {user.name ?? user.email}
                <span className="ml-2 text-xs text-zinc-500">owner</span>
              </span>
            </li>
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span>
                  {m.userName ?? m.userEmail}
                  <span className="ml-2 text-xs text-zinc-500">{m.role}</span>
                </span>
              </li>
            ))}
          </ul>
          {accepted.length > 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              {accepted.length} accepted invite
              {accepted.length === 1 ? '' : 's'} on record.
            </p>
          ) : null}
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Activity
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Last 50 mutations on this trip. 90-day retention rolls out in
            Phase 11 cleanup.
          </p>
          {activity.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No activity yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
              {activity.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">
                      {row.actorName ?? row.actorEmail ?? 'Someone'}
                    </span>{' '}
                    <span className="text-zinc-500">
                      {row.action}d {row.entityType}
                    </span>
                  </span>
                  <time
                    className="shrink-0 text-xs text-zinc-500"
                    dateTime={row.at.toISOString()}
                  >
                    {row.at.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function getOrigin(): string {
  // Best-effort origin for displaying the invite link. NEXT_PUBLIC_APP_URL
  // wins; otherwise localhost dev fallback.
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}
