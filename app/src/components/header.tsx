'use client';

// Header shell for authenticated pages. Owns the modal-state for
// SettingsModal so the AccountMenu can open it. Phase 2+ extends this
// with breadcrumb, undo/redo, collaborator stack, share/export buttons.

import { useState } from 'react';
import { AccountMenu } from './account-menu';
import { SettingsModal } from './settings-modal';
import { SavedAgo } from './saved-ago';
import {
  SETTINGS_DEFAULTS,
  type AppSettings,
} from '@/lib/user-settings-types';
import type { Dict } from '@/lib/i18n-client';
import styles from './header.module.css';

type User = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type Props = {
  user: User;
  tripTitle?: string;
  tripUpdatedAt?: string;
  settings?: AppSettings;
  dict?: Dict;
};

export function Header({
  user,
  tripTitle,
  tripUpdatedAt,
  settings,
  dict,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.brand}>
          <svg viewBox="0 0 32 32" fill="currentColor" width="22" height="22" aria-hidden>
            <path d="M16 3.2c-3.4 0-5.5 2-7.6 2-2.2 0-4.6-1.9-6.6.5C-.6 8.5.4 14.6 3.6 19.7c1.6 2.5 3.7 5.3 6.5 5.2 2.6-.1 3.6-1.7 6.7-1.7 3.1 0 4 1.7 6.7 1.6 2.8-.1 4.6-2.6 6.3-5.1 1.9-2.9 2.7-5.7 2.7-5.9-.1 0-5.2-2-5.3-7.9 0-4.9 4-7.3 4.2-7.4-2.3-3.4-5.9-3.8-7.2-3.9-3.3-.3-6 1.9-7.5 1.9z" />
          </svg>
          <span className={styles.brandName}>Wander</span>
        </div>
        {tripTitle ? (
          <span className="hidden text-sm text-zinc-700 sm:inline dark:text-zinc-300">
            / {tripTitle}
          </span>
        ) : null}
        {tripUpdatedAt ? <SavedAgo updatedAtIso={tripUpdatedAt} /> : null}

        <div className={styles.spacer} />

        <AccountMenu
          user={user}
          onSettings={() => setSettingsOpen(true)}
        />
      </header>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initial={settings ?? SETTINGS_DEFAULTS}
        dict={dict}
      />
    </>
  );
}
