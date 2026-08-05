import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { and, asc, desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { invites, tripMemberships, trips, users } from '@/db/schema';
import { TripRail } from '@/components/trip-rail';
import { BudgetSettingsForm } from '@/components/budget-settings-form';
import { loadBookingCounts } from '@/lib/trip-queries';
import { countRowsInCurrency, loadTripCurrency } from '@/lib/expense-queries';
import { createInviteAction, revokeInviteAction } from '@/app/actions/invites';
import { deleteTripAction } from '@/app/actions/trips';
import { saveTripBudgetAction } from '@/app/actions/budget';
import { TripSettingsForm } from '@/components/trip-settings-form';
import { TripSettingsDelete } from '@/components/trip-settings-delete';
import {
  SettingsFolio,
  SettingsPane,
  SettingsNotice,
  SettingsField,
} from '@/components/settings-folio';
import styles from '@/components/settings-folio.module.css';
import { SubmitButton } from '@/components/submit-button';
import { buttonClasses } from '@/components/ui';

export const metadata: Metadata = { title: 'Trip settings' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ invited?: string; s?: string }>;

const BUDGET_CATEGORIES = [
  { id: 'transport', label: 'Transport' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'food', label: 'Food & dining' },
  { id: 'activities', label: 'Activities' },
  { id: 'shopping', label: 'Shopping & misc' },
] as const;

function formatInviteExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(expiresAt);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'trip';
}

async function getOrigin(): Promise<string> {
  const hdrs = await headers();
  const forwarded = hdrs.get('x-forwarded-proto')
    ? `${hdrs.get('x-forwarded-proto')}://${hdrs.get('x-forwarded-host') ?? hdrs.get('host')}`
    : null;
  return forwarded ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

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
  const { invited: justIssuedToken, s: activeSection } = await searchParams;

  const tripRow = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const trip = tripRow[0];
  if (!trip || trip.ownerId !== user.id) notFound();

  const tripCurrency = await loadTripCurrency(tripId, trip.currency);
  const [counts, members, pendingInvites, budgetRows] = await Promise.all([
    loadBookingCounts(tripId),
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
      .select()
      .from(invites)
      .where(and(eq(invites.tripId, tripId), eq(invites.status, 'pending')))
      .orderBy(desc(invites.createdAt)),
    countRowsInCurrency(tripId, tripCurrency),
  ]);

  const budgetConfig = trip.budgetConfig ?? null;
  const inviteLink = justIssuedToken
    ? `${await getOrigin()}/invite/${justIssuedToken}`
    : null;
  const calendarFilename = `${slugify(trip.title)}.ics`;

  return (
    <>
      <TripRail tripId={tripId} active="settings" counts={counts} />
      <main className="mx-auto min-w-0 max-w-5xl flex-1 px-6 py-10 sm:px-10">
        <header className={styles.pageIntro}>
          <div className={styles.eyebrow}>Trip</div>
          <h1 className={styles.pageTitle}>Trip settings</h1>
          <p className={styles.pageDescription}>
            Details, budget and collaborators for this trip. Your own preferences live in{' '}
            <Link href="/settings" className={styles.introLink}>
              account settings
            </Link>
            .
          </p>
        </header>

        <SettingsFolio
          scopeLabel="Trip"
          scopeTitle={trip.title}
          sections={[
            { id: 'trip', label: 'Trip details' },
            { id: 'budget', label: 'Budget & currency' },
            { id: 'people', label: 'People' },
            { id: 'integrations', label: 'Integrations' },
            { id: 'danger', label: 'Delete trip', danger: true },
          ] as Array<{ id: string; label: string; danger?: boolean }>}
          navLabel="Trip settings sections"
          active={activeSection}
        >
          <SettingsPane
            id="trip"
            title="Trip details"
            description="The name and dates every other view reads from. Extending the dates adds itinerary days; the range cannot be shortened below the days you already have."
          >
            <TripSettingsForm
              tripId={tripId}
              title={trip.title}
              startDate={trip.startDate}
              endDate={trip.endDate}
            />
          </SettingsPane>

          <SettingsPane
            id="budget"
            title="Budget & currency"
            description="The currency every cost is compared in, and what you are aiming to spend. Booking costs are derived from these."
          >
            <BudgetSettingsForm
              tripId={tripId}
              currency={tripCurrency}
              amount={budgetConfig?.amount ?? null}
              basis={(budgetConfig?.basis ?? 'total') as 'total' | 'per_person' | 'per_day'}
              caps={budgetConfig?.caps ?? {}}
              affectedRows={budgetRows}
              categories={BUDGET_CATEGORIES.map((c) => ({
                id: c.id,
                label: c.label,
              }))}
              action={saveTripBudgetAction}
              compact={false}
            />
          </SettingsPane>

          <SettingsPane
            id="people"
            title="People"
            description="Who can see and edit this trip. Email sending is offline — copy the invite link and send it yourself."
          >
            <SettingsNotice>
              Email send is offline for now. Copy the invite link from the row below and share it.
            </SettingsNotice>

            {inviteLink ? (
              <div className={styles.contentCard} style={{ marginTop: 14 }}>
                <div className={styles.rosterMeta}>Invite created</div>
                <div style={{ marginTop: 4, wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                  {inviteLink}
                </div>
              </div>
            ) : null}

            <form action={createInviteAction} className={styles.formStack} style={{ marginTop: 18 }}>
              <input type="hidden" name="tripId" value={tripId} />
              <div className={styles.rowTwo}>
                <SettingsField label="Invite by email">
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="friend@example.com"
                    className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </SettingsField>
                <SettingsField label="Can">
                  <select
                    name="role"
                    defaultValue="editor"
                    className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="editor">Edit the trip</option>
                    <option value="viewer">View only</option>
                  </select>
                </SettingsField>
              </div>
              <div className={styles.actionRow} style={{ justifyContent: 'flex-start' }}>
                <SubmitButton className={buttonClasses('primary')} pendingText={<span>Creating…</span>}>
                  <span>Create invite link</span>
                </SubmitButton>
              </div>
            </form>

            <ul className={styles.roster}>
              {members.map((member) => (
                <li key={member.id} className={styles.rosterRow}>
                  <div className={styles.rosterMain}>
                    <div className={styles.rosterName}>{member.userName ?? member.userEmail}</div>
                    <div className={styles.rosterMeta}>{member.userEmail}</div>
                  </div>
                  <span
                    className={styles.tag}
                  >
                    {member.role === 'viewer' ? 'Viewer' : 'Editor'}
                  </span>
                </li>
              ))}
              {pendingInvites.map((invite) => (
                <li key={invite.id} className={styles.rosterRow}>
                  <div className={styles.rosterMain}>
                    <div className={styles.rosterName}>{invite.email}</div>
                    <div className={styles.rosterMeta}>
                      Link expires {formatInviteExpiry(invite.expiresAt)}
                    </div>
                  </div>
                  <span className={`${styles.tag} ${styles.tagPending}`}>Invited</span>
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <button type="submit" className={styles.linkButton}>
                      Revoke
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </SettingsPane>

          <SettingsPane
            id="integrations"
            title="Integrations"
            description="How this trip reaches your calendar and your scripts."
          >
            <div className={styles.tokenRow}>
              <div>
                <div className={styles.tokenName}>{slugify(trip.title)}.ics</div>
                <div className={styles.tokenMeta}>
                  Itinerary days and bookings. No reminders are included.
                </div>
              </div>
              <a
                href={`/trip/${tripId}/calendar/export`}
                download={calendarFilename}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Download
              </a>
            </div>
          </SettingsPane>

          <SettingsPane
            id="danger"
            title="Delete trip"
            description="Removes the itinerary, bookings, expenses and invites for everyone on it."
          >
            <p className={styles.dangerNote}>
              Deleting asks you to confirm once, in the same dialog the rest of the app uses for
              destructive actions. Trips can also be deleted from the trips list on the home page.
            </p>
            <div className={styles.actionRow} style={{ justifyContent: 'flex-start', marginTop: 20 }}>
              <TripSettingsDelete tripId={tripId} title={trip.title} onDelete={deleteTripAction} />
            </div>
          </SettingsPane>
        </SettingsFolio>
      </main>
    </>
  );
}
