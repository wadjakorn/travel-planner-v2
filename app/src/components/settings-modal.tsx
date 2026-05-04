'use client';

// Phase 9A: server-persisted settings. Submit via form action — saves to
// user_settings + cookie, then revalidates so SSR layout reflects new theme.

import { useState, useEffect } from 'react';
import { Close, Check } from '@/components/icons';
import { saveSettingsAction } from '@/app/actions/settings';
import type { AppSettings } from '@/lib/user-settings-types';
import styles from './settings-modal.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  initial: AppSettings;
};

function SetSwitch({
  label,
  on,
  onToggle,
  name,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  name: string;
}) {
  return (
    <label className={styles.setRow}>
      <span>{label}</span>
      {/* hidden input carries value to form submit */}
      <input type="hidden" name={name} value={on ? 'true' : 'false'} />
      <button
        className={`${styles.setSwitch} ${on ? styles.setSwitchOn : ''}`}
        onClick={onToggle}
        type="button"
      >
        <span className={styles.setSwitchThumb} />
      </button>
    </label>
  );
}

export function SettingsModal({ open, onClose, initial }: Props) {
  const [settings, setSettings] = useState<AppSettings>(initial);

  const update = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const themeOptions: {
    id: AppSettings['theme'];
    label: string;
    preview: 'themeLight' | 'themeDark' | 'themeSplit';
  }[] = [
    { id: 'light', label: 'Light', preview: 'themeLight' },
    { id: 'dark', label: 'Dark', preview: 'themeDark' },
    { id: 'system', label: 'Auto', preview: 'themeSplit' },
  ];

  const langOptions: {
    id: AppSettings['lang'];
    label: string;
    sub: string;
    flag: string;
  }[] = [
    { id: 'en', label: 'English', sub: 'English', flag: '🇬🇧' },
    { id: 'th', label: 'ไทย', sub: 'Thai', flag: '🇹🇭' },
  ];

  const unitOptions: { id: AppSettings['units']; label: string }[] = [
    { id: 'metric', label: 'Metric (km, °C)' },
    { id: 'imperial', label: 'Imperial (mi, °F)' },
  ];

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <form
          action={async (fd) => {
            await saveSettingsAction(fd);
            // Apply immediately on client so user sees change w/o waiting
            // for SSR revalidation. Layout will agree on next navigation.
            const t = String(fd.get('theme') ?? 'system');
            const root = document.documentElement;
            root.setAttribute('data-theme-pref', t);
            const resolved =
              t === 'system'
                ? window.matchMedia('(prefers-color-scheme: dark)').matches
                  ? 'dark'
                  : 'light'
                : t;
            root.setAttribute('data-theme', resolved);
            onClose();
          }}
        >
          <header className={styles.head}>
            <div>
              <div className={styles.eyebrow}>Account</div>
              <h2 className={styles.title}>Settings</h2>
            </div>
            <button className={styles.closeBtn} onClick={onClose} type="button">
              <Close />
            </button>
          </header>

          <div className={styles.body}>
            {/* Hidden carriers — buttons set state, hidden inputs ship values */}
            <input type="hidden" name="theme" value={settings.theme} />
            <input type="hidden" name="lang" value={settings.lang} />
            <input type="hidden" name="units" value={settings.units} />

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Appearance</h3>
              <div className={styles.themeGrid}>
                {themeOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`${styles.themeTile} ${settings.theme === o.id ? styles.themeTileSelected : ''}`}
                    onClick={() => update('theme', o.id)}
                  >
                    <div
                      className={`${styles.themePreview} ${styles[o.preview]}`}
                    >
                      <div className={styles.tpBar} />
                      <div className={styles.tpCard} />
                      <div className={styles.tpCard} />
                    </div>
                    <span className={styles.themeLabel}>{o.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Language</h3>
              <div className={styles.langGrid}>
                {langOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`${styles.langTile} ${settings.lang === o.id ? styles.langTileSelected : ''}`}
                    onClick={() => update('lang', o.id)}
                  >
                    <span className={styles.langFlag}>{o.flag}</span>
                    <div>
                      <div className={styles.langLabel}>{o.label}</div>
                      <div className={styles.langSub}>{o.sub}</div>
                    </div>
                    {settings.lang === o.id && (
                      <span className={styles.langCheck}>
                        <Check />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Units</h3>
              <div className={styles.toggleRow}>
                {unitOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={`${styles.toggleBtn} ${settings.units === o.id ? styles.toggleBtnSelected : ''}`}
                    onClick={() => update('units', o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Notifications</h3>
              <SetSwitch
                label="Email trip updates"
                on={settings.notifEmail}
                onToggle={() => update('notifEmail', !settings.notifEmail)}
                name="notifEmail"
              />
              <SetSwitch
                label="Push alerts for bookings"
                on={settings.notifPush}
                onToggle={() => update('notifPush', !settings.notifPush)}
                name="notifPush"
              />
            </section>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Privacy</h3>
              <SetSwitch
                label="Public trip page"
                on={settings.publicTrip}
                onToggle={() => update('publicTrip', !settings.publicTrip)}
                name="publicTrip"
              />
            </section>
          </div>

          <footer className={styles.foot}>
            <span style={{ flex: 1 }} />
            <button
              className={`${styles.btn} ${styles.btnPrimary}`}
              type="submit"
            >
              Save
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
