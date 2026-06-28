'use client';

// Header shell for authenticated pages. Owns the modal-state for
// SettingsModal so the AccountMenu can open it. Phase 2+ extends this
// with breadcrumb, undo/redo, collaborator stack, share/export buttons.

import { useState } from 'react';
import Link from 'next/link';
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

type Collaborator = {
  id: string;
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
  collaborators?: Collaborator[];
};

function initialsOf(name?: string | null, email?: string | null): string {
  const src = (name ?? email ?? '?').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 55%, 55%)`;
}

function AvatarStack({ collaborators }: { collaborators: Collaborator[] }) {
  if (collaborators.length === 0) return null;
  const visible = collaborators.slice(0, 4);
  const overflow = collaborators.length - visible.length;
  return (
    <div className="flex items-center -space-x-2 mr-2">
      {visible.map((c) => (
        <span
          key={c.id}
          title={c.name ?? c.email ?? ''}
          className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full ring-2 ring-surface text-[10px] font-semibold text-white"
          style={{ background: colorFor(c.id) }}
        >
          {c.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.image}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            initialsOf(c.name, c.email)
          )}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted ring-2 ring-surface">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

export function Header({
  user,
  tripTitle,
  tripUpdatedAt,
  settings,
  dict,
  collaborators,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className={styles.header}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="Home — switch trip"
          title="All trips"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" width={22} height={22} style={{ borderRadius: 5 }} />
          <span className={styles.brandName}>Traver Planel</span>
        </Link>
        {tripTitle ? (
          <span className="hidden items-center gap-2 text-sm text-muted sm:inline-flex">
            <span aria-hidden className="text-border">/</span>
            <span className="max-w-[40vw] truncate font-medium text-foreground">
              {tripTitle}
            </span>
          </span>
        ) : null}
        {tripUpdatedAt ? <SavedAgo updatedAtIso={tripUpdatedAt} /> : null}

        <div className={styles.spacer} />

        {collaborators && collaborators.length > 0 ? (
          <AvatarStack collaborators={collaborators} />
        ) : null}
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
