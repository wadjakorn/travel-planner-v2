'use client';

// Persistence wired in Phase 9 (settings + i18n + theme). State is local-only until then.

import { useState, useEffect } from 'react';
import { Close, Check } from '@/components/icons';
import styles from './settings-modal.module.css';

type Settings = {
  theme: 'light' | 'dark' | 'system';
  lang: 'en' | 'th';
  units: 'metric' | 'imperial';
  notifEmail: boolean;
  notifPush: boolean;
  publicTrip: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Settings>;
};

const DEFAULTS: Settings = {
  theme: 'system',
  lang: 'en',
  units: 'metric',
  notifEmail: true,
  notifPush: true,
  publicTrip: false,
};

function SetSwitch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <label className={styles.setRow}>
      <span>{label}</span>
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
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS, ...initial });

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) =>
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

  const themeOptions: { id: Settings['theme']; label: string; preview: 'themeLight' | 'themeDark' | 'themeSplit' }[] = [
    { id: 'light', label: 'Light', preview: 'themeLight' },
    { id: 'dark', label: 'Dark', preview: 'themeDark' },
    { id: 'system', label: 'Auto', preview: 'themeSplit' },
  ];

  const langOptions: { id: Settings['lang']; label: string; sub: string; flag: string }[] = [
    { id: 'en', label: 'English', sub: 'English', flag: '🇬🇧' },
    { id: 'th', label: 'ไทย', sub: 'Thai', flag: '🇹🇭' },
  ];

  const unitOptions: { id: Settings['units']; label: string }[] = [
    { id: 'metric', label: 'Metric (km, °C)' },
    { id: 'imperial', label: 'Imperial (mi, °F)' },
  ];

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
          {/* Appearance */}
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
                  <div className={`${styles.themePreview} ${styles[o.preview]}`}>
                    <div className={styles.tpBar} />
                    <div className={styles.tpCard} />
                    <div className={styles.tpCard} />
                  </div>
                  <span className={styles.themeLabel}>{o.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Language */}
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

          {/* Units */}
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

          {/* Notifications */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Notifications</h3>
            <SetSwitch
              label="Email trip updates"
              on={settings.notifEmail}
              onToggle={() => update('notifEmail', !settings.notifEmail)}
            />
            <SetSwitch
              label="Push alerts for bookings"
              on={settings.notifPush}
              onToggle={() => update('notifPush', !settings.notifPush)}
            />
          </section>

          {/* Privacy */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Privacy</h3>
            <SetSwitch
              label="Public trip page"
              on={settings.publicTrip}
              onToggle={() => update('publicTrip', !settings.publicTrip)}
            />
          </section>
        </div>

        <footer className={styles.foot}>
          <span style={{ flex: 1 }} />
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose} type="button">
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
