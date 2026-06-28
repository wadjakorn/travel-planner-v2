'use client';

import { useEffect, useState } from 'react';
import { Plus, Share, Settings, External } from '@/components/icons';
import { signInGoogleAction, signOutAction } from '@/app/actions/auth';
import styles from './account-menu.module.css';

type Props = {
  user: { id?: string; name?: string | null; email?: string | null; image?: string | null };
  onInvite?: () => void;
  onSettings?: () => void;
};

const PALETTE = ['#ffd5b4', '#c4dffc', '#b4f1d5', '#f5d0e8', '#d5c4fc', '#fcedb4'];

function pickColor(seed: string | null | undefined): string {
  if (!seed) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function deriveInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

export function AccountMenu({ user, onInvite, onSettings }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onClick = () => setOpen(false);
    setTimeout(() => window.addEventListener('click', onClick, { once: true }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const initials = deriveInitials(user.name, user.email);
  const bgColor = pickColor(user.email);

  return (
    <div className={styles.wrap} onClick={(e) => e.stopPropagation()}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name ?? 'avatar'}
            className={`${styles.avatar}`}
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <span className={styles.avatar} style={{ background: bgColor }}>
            {initials}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.menu} role="menu" aria-label="Account">
          {/* Active account block */}
          <div className={styles.active}>
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name ?? 'avatar'}
                className={`${styles.avatar} ${styles.avatarLg}`}
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <span className={`${styles.avatar} ${styles.avatarLg}`} style={{ background: bgColor }}>
                {initials}
              </span>
            )}
            <div>
              <div className={styles.rowName}>{user.name}</div>
              <div className={styles.rowEmail}>{user.email}</div>
            </div>
          </div>

          <div className={styles.divider} />

          {/* Your accounts section */}
          <div className={styles.sectionLabel}>Your accounts</div>

          {/* Multi-account switch lands in Phase 1.5 — Auth.js v5 requires bespoke account-link UX. */}
          <form action={signInGoogleAction}>
            <button type="submit" role="menuitem" className={styles.row}>
              <span className={`${styles.avatar} ${styles.avatarDashed}`}>
                <Plus />
              </span>
              <div className={styles.rowBody}>
                <div className={styles.rowName}>Add Google account</div>
              </div>
            </button>
          </form>

          <div className={styles.divider} />

          {/* Actions */}
          <button
            className={styles.action}
            role="menuitem"
            onClick={() => { onInvite?.(); setOpen(false); }}
          >
            <Share aria-hidden="true" />
            <span>Invite collaborator</span>
          </button>

          <button
            className={styles.action}
            role="menuitem"
            onClick={() => { onSettings?.(); setOpen(false); }}
          >
            <Settings aria-hidden="true" />
            <span>Settings</span>
          </button>

          <form action={signOutAction}>
            <button type="submit" role="menuitem" className={`${styles.action} ${styles.actionDanger}`}>
              <External />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
