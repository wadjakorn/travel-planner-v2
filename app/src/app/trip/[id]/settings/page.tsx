import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { invites, tripMemberships, trips, users } from '@/db/schema';
import { BudgetSettingsForm } from '@/components/budget-settings-form';
import { countRowsInCurrency, loadTripCurrency } from '@/lib/expense-queries';
import { countEditors, resolveTravelers } from '@/lib/trip-travelers';
import {
  createInviteAction,
  regenerateInviteAction,
  revokeInviteAction,
} from '@/app/actions/invites';
import { InviteLinkReveal } from '@/components/invite-link-reveal';
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
import { absoluteUrl } from '@/lib/site-url';
import { getLang, tServer } from '@/lib/i18n';
import { localeTag } from '@/lib/week';

export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer();
  return { title: t('tripset_title') };
}

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ invited?: string; s?: string }>;

// Ids only: BudgetSettingsForm labels them (budget_cat_<id>, i18n P4).
const BUDGET_CATEGORIES = ['transport', 'hotels', 'food', 'activities', 'shopping'] as const;

// An example address, not copy: the same in every language.
const EMAIL_PLACEHOLDER = 'friend@example.com';

// Read the clock outside the component: calling Date.now() during render
// trips react-hooks/purity. Same shape as loadInvite in invite/[token]/page.tsx.
function isInviteExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}

// `locale` is localeTag(lang); it was `undefined` (the server default, en-US)
// before i18n P6, so English is unchanged.
function formatInviteExpiry(expiresAt: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
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
  const [members, pendingInvites, budgetRows, editorCount] = await Promise.all([
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
    // Projected, not select(): an unprojected row drags token_hash into this
    // page's props, and the folio subtree below is a client component, so the
    // hash would ship to the browser for no reason.
    db
      .select({
        id: invites.id,
        email: invites.email,
        role: invites.role,
        expiresAt: invites.expiresAt,
      })
      .from(invites)
      .where(and(eq(invites.tripId, tripId), eq(invites.status, 'pending')))
      .orderBy(desc(invites.createdAt)),
    countRowsInCurrency(tripId, tripCurrency),
    countEditors(trip),
  ]);

  const budgetConfig = trip.budgetConfig ?? null;
  const inviteLink = justIssuedToken
    ? absoluteUrl(`/invite/${justIssuedToken}`)
    : null;
  const calendarFilename = `${slugify(trip.title)}.ics`;
  const [t, lang] = await Promise.all([tServer(), getLang()]);
  const locale = localeTag(lang);
  // One sentence split around the account-settings link (Thai word order).
  const [introBefore, introAfter = ''] = t('tripset_intro').split('{link}');

  return (
    <>
      <main className="mx-auto min-w-0 max-w-5xl flex-1 px-6 py-10 sm:px-10">
        <header className={styles.pageIntro}>
          <div className={styles.eyebrow}>{t('tripset_trip')}</div>
          <h1 className={styles.pageTitle}>{t('tripset_title')}</h1>
          <p className={styles.pageDescription}>
            {introBefore}
            <Link href="/settings" className={styles.introLink}>
              {t('tripset_intro_link')}
            </Link>
            {introAfter}
          </p>
        </header>

        <SettingsFolio
          scopeLabel={t('tripset_trip')}
          scopeTitle={trip.title}
          sections={[
            { id: 'trip', label: t('tripset_details') },
            { id: 'budget', label: t('tripset_budget') },
            { id: 'people', label: t('tripset_people') },
            { id: 'integrations', label: t('tripset_integrations') },
            { id: 'danger', label: t('trip_delete_label'), danger: true },
          ] as Array<{ id: string; label: string; danger?: boolean }>}
          navLabel={t('tripset_sections_aria')}
          backLabel={t('tripset_back_all')}
          active={activeSection}
        >
          <SettingsPane
            id="trip"
            title={t('tripset_details')}
            description={t('tripset_details_body')}
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
            title={t('tripset_budget')}
            description={t('tripset_budget_body')}
          >
            <BudgetSettingsForm
              tripId={tripId}
              currency={tripCurrency}
              amount={budgetConfig?.amount ?? null}
              basis={(budgetConfig?.basis ?? 'total') as 'total' | 'per_person' | 'per_day'}
              caps={budgetConfig?.caps ?? {}}
              travelers={budgetConfig?.travelers ?? null}
              travelersDefault={resolveTravelers(null, editorCount)}
              affectedRows={budgetRows}
              categories={[...BUDGET_CATEGORIES]}
              action={saveTripBudgetAction}
              compact={false}
            />
          </SettingsPane>

          <SettingsPane
            id="people"
            title={t('tripset_people')}
            description={t('tripset_people_body')}
          >
            <SettingsNotice>{t('tripset_people_notice')}</SettingsNotice>

            {inviteLink ? (
              <div style={{ marginTop: 14 }}>
                <InviteLinkReveal url={inviteLink} />
              </div>
            ) : null}

            <form action={createInviteAction} className={styles.formStack} style={{ marginTop: 18 }}>
              <input type="hidden" name="tripId" value={tripId} />
              <div className={styles.rowTwo}>
                <SettingsField label={t('tripset_invite_email_label')}>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder={EMAIL_PLACEHOLDER}
                    className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </SettingsField>
                <SettingsField label={t('tripset_invite_role_label')}>
                  <select
                    name="role"
                    defaultValue="editor"
                    className="h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="editor">{t('tripset_invite_role_editor')}</option>
                    <option value="viewer">{t('tripset_invite_role_viewer')}</option>
                  </select>
                </SettingsField>
              </div>
              <div className={styles.actionRow} style={{ justifyContent: 'flex-start' }}>
                <SubmitButton className={buttonClasses('primary')}>
                  <span>{t('tripset_invite_create')}</span>
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
                    {member.role === 'viewer' ? t('role_viewer') : t('role_editor')}
                  </span>
                </li>
              ))}
              {pendingInvites.map((invite) => {
                // A row stays 'pending' past its deadline — the status only
                // flips to 'expired' when someone tries to accept it. So the
                // date has to be compared here, or a dead link reads as live.
                const expired = isInviteExpired(invite.expiresAt);
                return (
                  <li key={invite.id} className={styles.rosterRow}>
                    <div className={styles.rosterMain}>
                      <div className={styles.rosterName}>{invite.email}</div>
                      <div
                        className={`${styles.rosterMeta} ${expired ? styles.rosterExpired : ''}`}
                      >
                        {expired
                          ? t('tripset_invite_link_expired')
                          : t('tripset_invite_link_expires', {
                              date: formatInviteExpiry(invite.expiresAt, locale),
                            })}
                      </div>
                    </div>
                    <span className={`${styles.tag} ${styles.tagPending}`}>
                      {expired ? t('tripset_invite_expired') : t('tripset_invite_invited')}
                    </span>
                    {/* Not "Copy link": the old token is unrecoverable, so this
                        mints a new one and kills any link already sent. */}
                    <form action={regenerateInviteAction}>
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <button
                        type="submit"
                        className={styles.linkButton}
                        title={t('tripset_invite_new_link_title')}
                      >
                        {t('tripset_invite_new_link')}
                      </button>
                    </form>
                    <form action={revokeInviteAction}>
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <button type="submit" className={styles.linkButton}>
                        {t('settings_revoke')}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </SettingsPane>

          <SettingsPane
            id="integrations"
            title={t('tripset_integrations')}
            description={t('tripset_integrations_body')}
          >
            <div className={styles.tokenRow}>
              <div>
                <div className={styles.tokenName}>{calendarFilename}</div>
                <div className={styles.tokenMeta}>{t('tripset_ics_body')}</div>
              </div>
              <a
                href={`/trip/${tripId}/calendar/export`}
                download={calendarFilename}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('tripset_download')}
              </a>
            </div>
          </SettingsPane>

          <SettingsPane
            id="danger"
            title={t('trip_delete_label')}
            description={t('tripset_delete_body')}
          >
            <p className={styles.dangerNote}>{t('tripset_delete_note')}</p>
            <div className={styles.actionRow} style={{ justifyContent: 'flex-start', marginTop: 20 }}>
              <TripSettingsDelete tripId={tripId} title={trip.title} onDelete={deleteTripAction} />
            </div>
          </SettingsPane>
        </SettingsFolio>
      </main>
    </>
  );
}
