'use client';

// The invite link is shown exactly once: the database stores only the token
// hash, so once this block leaves the screen the link cannot be rebuilt from
// anywhere. Hence a real copy affordance instead of bare selectable text.

import { useRef, useState } from 'react';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui';
import { useT } from '@/components/i18n-provider';
import styles from './settings-folio.module.css';

export function InviteLinkReveal({ url }: { url: string }) {
  const t = useT();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  // Set only when the clipboard write actually failed, so the manual
  // instruction never appears next to a copy that worked.
  const [manual, setManual] = useState(false);

  const selectAll = () => inputRef.current?.select();

  const copy = async () => {
    // navigator.clipboard is undefined on plain http and can reject when the
    // permission is denied. Unlike api-tokens-section.tsx, the success toast
    // fires only after the write resolves — telling someone their invite link
    // is on the clipboard when it is not costs them the link.
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setManual(false);
      toast({ variant: 'success', title: t('tripset_invite_copied_toast') });
    } catch {
      setManual(true);
      selectAll();
    }
  };

  return (
    <div className={styles.apiReveal} role="status">
      <div className={styles.apiRevealLabel}>
        {t('settings_copy_once')}
      </div>
      <input
        ref={inputRef}
        className={styles.inviteLinkInput}
        readOnly
        value={url}
        aria-label={t('tripset_invite_link_aria')}
        onFocus={selectAll}
        onClick={selectAll}
      />
      <div className={styles.apiRevealActions}>
        <Button type="button" variant="outline" onClick={copy}>
          {t('tripset_copy_link')}
        </Button>
      </div>
      {manual ? (
        <div className={styles.inviteLinkManual}>
          {t('tripset_invite_copy_manual')}
        </div>
      ) : null}
    </div>
  );
}
