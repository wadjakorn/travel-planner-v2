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
import styles from '@/components/settings-folio.module.css';
import { getLang, tServer } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer();
  return { title: t('settings') };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s: activeSection } = await searchParams;
  const session = await auth();
  const user = session?.user;
  const settings = await loadAccountSettings(user?.id);
  // The Language control starts at the language this page is rendering in
  // (the cookie), not settings.lang: a user with no row reads as 'en' there,
  // and seeding from it would reset a Thai-cookie user on any save.
  const [t, lang] = await Promise.all([tServer(), getLang()]);

  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
        <header className={styles.pageIntro}>
          <Link href="/" className={styles.backLink}>
            <Chevron className={styles.backLinkIcon} aria-hidden />
            {t('nav_all_trips')}
          </Link>
          <div className={styles.eyebrow}>{t('settings_account')}</div>
          <h1 className={styles.pageTitle}>{t('settings_title')}</h1>
          <p className={styles.pageDescription}>{t('settings_intro')}</p>
        </header>

        <SettingsFolio
          scopeLabel={t('settings_account')}
          scopeTitle={user?.name ?? t('settings_your_account')}
          sections={[
            { id: 'preferences', label: t('settings_preferences') },
            { id: 'tokens', label: t('settings_api_tokens') },
          ]}
          navLabel={t('settings_sections_aria')}
          backLabel={t('settings_back_all')}
          active={activeSection}
        >
          <SettingsPane
            id="preferences"
            title={t('settings_preferences')}
            description={t('settings_preferences_body')}
          >
            <ActionForm
              action={saveSettingsAction}
              successMessage={t('settings_saved_toast')}
              className={styles.formStack}
            >
              {/* saveSettingsAction reads the whole settings row off this one
                  form: pick() falls back to a default and bool() reads an absent
                  checkbox as false. Anything this page does not render still has
                  to ride along, or saving units would quietly reset it. */}
              <input type="hidden" name="theme" value={settings.theme} />
              {settings.notifEmail && <input type="hidden" name="notifEmail" value="on" />}
              {settings.notifPush && <input type="hidden" name="notifPush" value="on" />}
              {settings.publicTrip && <input type="hidden" name="publicTrip" value="on" />}

              <SettingsSegmented
                name="units"
                label={t('settings_distances_label')}
                defaultValue={settings.units}
                options={[
                  { value: 'metric', label: t('settings_units_km') },
                  { value: 'imperial', label: t('settings_units_mi') },
                ]}
                hint={t('settings_distances_hint')}
              />

              <SettingsField label={t('appearance')}>
                <SettingsDeferred
                  title={t('appearance')}
                  reason={t('settings_appearance_deferred')}
                />
              </SettingsField>

              <SettingsSegmented
                name="lang"
                label={t('language')}
                defaultValue={lang}
                options={[
                  { value: 'en', label: t('english') },
                  { value: 'th', label: t('thai') },
                ]}
              />

              <ActionError />

              <div className={styles.actionRow}>
                <ActionSubmit>
                  <span>{t('settings_save_preferences')}</span>
                </ActionSubmit>
              </div>
            </ActionForm>
          </SettingsPane>

          <SettingsPane
            id="tokens"
            title={t('settings_api_tokens')}
            description={t('settings_api_tokens_body')}
          >
            <ApiTokensSection signedIn={Boolean(user?.id)} active />
          </SettingsPane>
        </SettingsFolio>
      </main>
    </>
  );
}
