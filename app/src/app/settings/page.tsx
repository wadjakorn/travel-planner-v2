import type { Metadata } from 'next';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { Header } from '@/components/header';
import { loadAccountSettings } from '@/lib/user-settings';
import {
  Chevron,
  SettingsDeferred,
  SettingsFolio,
  SettingsPane,
  SettingsSegmented,
  SettingsField,
} from '@/components/settings-folio';
import { ApiTokensSection } from '@/components/api-tokens-section';
import { saveSettingsAction } from '@/app/actions/settings';
import { ActionForm, ActionError, ActionSubmit } from '@/components/action-form';
import { buttonClasses } from '@/components/ui';
import styles from '@/components/settings-folio.module.css';

export const metadata: Metadata = { title: 'Settings' };

const ACCOUNT_SECTIONS = [
  { id: 'preferences', label: 'Preferences' },
  { id: 'tokens', label: 'API tokens' },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s: activeSection } = await searchParams;
  const session = await auth();
  const user = session?.user;
  const settings = await loadAccountSettings(user?.id);

  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <header className={styles.pageIntro}>
          <Link href="/" className={styles.backLink}>
            <Chevron className={styles.backLinkIcon} aria-hidden />
            All trips
          </Link>
          <div className={styles.eyebrow}>Account</div>
          <h1 className={styles.pageTitle}>Settings</h1>
          <p className={styles.pageDescription}>
            Preferences that follow you across every trip. Trip name, dates, budget and
            collaborators live in each trip&apos;s own settings.
          </p>
        </header>

        <SettingsFolio
          scopeLabel="Account"
          scopeTitle={user?.name ?? 'Your account'}
          sections={[...ACCOUNT_SECTIONS]}
          navLabel="Account settings sections"
          active={activeSection}
        >
          <SettingsPane
            id="preferences"
            title="Preferences"
            description="These follow you across every trip. Works signed out too — the choice is stored in a cookie until you have an account."
          >
            <ActionForm
              action={saveSettingsAction}
              successMessage="Preferences saved"
              className={styles.formStack}
            >
              {/* saveSettingsAction reads the whole settings row off this one
                  form: pick() falls back to a default and bool() reads an absent
                  checkbox as false. Anything this page does not render still has
                  to ride along, or saving units would quietly reset it. */}
              <input type="hidden" name="theme" value={settings.theme} />
              <input type="hidden" name="lang" value={settings.lang} />
              {settings.notifEmail && <input type="hidden" name="notifEmail" value="on" />}
              {settings.notifPush && <input type="hidden" name="notifPush" value="on" />}
              {settings.publicTrip && <input type="hidden" name="publicTrip" value="on" />}

              <SettingsSegmented
                name="units"
                label="Distances"
                defaultValue={settings.units}
                options={[
                  { value: 'metric', label: 'Kilometres' },
                  { value: 'imperial', label: 'Miles' },
                ]}
                hint="Applies to route legs and day summaries."
              />

              <SettingsField label="Appearance">
                <SettingsDeferred
                  title="Appearance"
                  reason="The app is light for now. Dark mode ships with the design-system work."
                />
              </SettingsField>

              <SettingsField label="Language">
                <SettingsDeferred
                  title="Language"
                  reason="English only today. Thai is drafted but not wired up."
                />
              </SettingsField>

              <ActionError />

              <div className={styles.actionRow}>
                <ActionSubmit
                  className={buttonClasses('primary')}
                  pendingText={<span>Saving…</span>}
                >
                  <span>Save preferences</span>
                </ActionSubmit>
              </div>
            </ActionForm>
          </SettingsPane>

          <SettingsPane
            id="tokens"
            title="API tokens"
            description="For scripts and agents acting as you over /api/v1."
          >
            <ApiTokensSection signedIn={Boolean(user?.id)} active />
          </SettingsPane>
        </SettingsFolio>
      </main>
    </>
  );
}
