'use client';

// Settings → API access. Lists a user's personal access tokens and lets
// them mint or revoke one. The plaintext of a freshly minted token is shown
// once, inline, then never again. Renders inside the settings page's form,
// so every control is type="button" and talks to server actions directly —
// no nested <form>.

import { useEffect, useState } from 'react';
import {
  listApiTokensAction,
  createApiTokenAction,
  revokeApiTokenAction,
} from '@/app/actions/api-tokens';
import type { ApiTokenSummary, ApiTokenScope } from '@/lib/api-tokens';
import { useToast } from '@/components/toast';
import { Button, Input, Select } from '@/components/ui';
import { SettingsNotice } from '@/components/settings-folio';
import { useT } from '@/components/i18n-provider';
import { logActionFailure } from '@/lib/action-errors';
import styles from './settings-folio.module.css';

// Code, not copy: the same in every language.
const BEARER_HEADER = 'Authorization: Bearer <token>';

type Props = {
  active: boolean;
  signedIn: boolean;
};

export function ApiTokensSection({ active, signedIn }: Props) {
  const t = useT();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiTokenScope>('read-write');
  const [busy, setBusy] = useState(false);
  const [freshPlaintext, setFreshPlaintext] = useState<string | null>(null);

  // Fetch the list the first time this section is opened while signed in.
  // `ignore` drops a response that arrives after the section closed or the
  // inputs changed, which the previous version would still have applied.
  useEffect(() => {
    if (!active || !signedIn || loaded) return;
    let ignore = false;
    void (async () => {
      try {
        const list = await listApiTokensAction();
        if (ignore) return;
        setTokens(list);
        setLoaded(true);
      } catch {
        // Anonymous / signed-out: leave the list empty and unloaded.
      }
    })();
    return () => {
      ignore = true;
    };
  }, [active, signedIn, loaded]);

  const onCreate = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { plaintext, token } = await createApiTokenAction(name, scope);
      setFreshPlaintext(plaintext);
      setTokens((list) => [token, ...list]);
      setName('');
      setScope('read-write');
    } catch (err) {
      // Fixed copy, never err.message: production redacts thrown action
      // errors (lib/action-errors.ts).
      logActionFailure('create api token', err);
      toast({
        variant: 'error',
        title: t('settings_token_create_error'),
        description: t('err_try_again_body'),
      });
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    setBusy(true);
    try {
      await revokeApiTokenAction(id);
      setTokens((list) => list.filter((x) => x.id !== id));
    } catch (err) {
      logActionFailure('revoke api token', err);
      toast({
        variant: 'error',
        title: t('settings_token_revoke_error'),
        description: t('err_try_again_body'),
      });
    } finally {
      setBusy(false);
    }
  };

  const copyFresh = () => {
    if (freshPlaintext) void navigator.clipboard?.writeText(freshPlaintext);
    toast({ variant: 'success', title: t('settings_copied_toast') });
  };

  // One sentence split around the inline <code> (Thai word order).
  const [hintBefore, hintAfter = ''] = t('settings_token_hint').split('{code}');

  return (
    <div>
      <p className={styles.tokenHint}>
        {hintBefore}
        <code>{BEARER_HEADER}</code>
        {hintAfter}
      </p>

      {!signedIn ? (
        <SettingsNotice>
          {t('settings_token_signin_notice')}
        </SettingsNotice>
      ) : null}

      {freshPlaintext ? (
        <div className={styles.apiReveal} role="status">
          <div className={styles.apiRevealLabel}>
            {t('settings_copy_once')}
          </div>
          <code className={styles.apiRevealCode}>{freshPlaintext}</code>
          <div className={styles.apiRevealActions}>
            <Button type="button" variant="outline" onClick={copyFresh}>
              {t('settings_copy')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFreshPlaintext(null)}
            >
              {t('done')}
            </Button>
          </div>
        </div>
      ) : null}

      {signedIn ? (
        <div className={styles.tokenCreateRow}>
          <Input
            type="text"
            className={styles.tokenInput}
            placeholder={t('settings_token_name_placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void onCreate();
              }
            }}
          />
          <Select
            className={styles.tokenInput}
            value={scope}
            onChange={(e) => setScope(e.target.value as ApiTokenScope)}
            aria-label={t('settings_token_scope_aria')}
          >
            <option value="read-write">{t('settings_token_scope_rw')}</option>
            <option value="read">{t('settings_token_scope_read')}</option>
          </Select>
          <Button
            type="button"
            onClick={onCreate}
            disabled={busy || !name.trim()}
          >
            {t('settings_token_create')}
          </Button>
        </div>
      ) : null}

      {tokens.length > 0 ? (
        <ul className={styles.tokenList}>
          {tokens.map((token) => (
            <li key={token.id} className={styles.tokenRow}>
              <div>
                <div className={styles.tokenName}>{token.name}</div>
                <div className={styles.tokenMeta}>
                  {token.scope === 'read'
                    ? t('settings_token_scope_read')
                    : t('settings_token_scope_rw')}
                  {' · '}
                  {token.lastUsedAt
                    ? t('settings_token_last_used', {
                        date: new Date(token.lastUsedAt).toLocaleDateString(),
                      })
                    : t('settings_token_never_used')}
                </div>
              </div>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => onRevoke(token.id)}
                disabled={busy}
              >
                {t('settings_revoke')}
              </button>
            </li>
          ))}
        </ul>
      ) : loaded ? (
        signedIn ? <p className={styles.tokenMeta}>{t('settings_token_empty')}</p> : null
      ) : null}
    </div>
  );
}
