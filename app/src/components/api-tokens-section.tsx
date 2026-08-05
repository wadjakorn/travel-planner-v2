'use client';

// Settings → API access. Lists a user's personal access tokens and lets
// them mint or revoke one. The plaintext of a freshly minted token is shown
// once, inline, then never again. Renders inside the settings modal's form,
// so every control is type="button" and talks to server actions directly —
// no nested <form>.

import { useCallback, useEffect, useState } from 'react';
import {
  listApiTokensAction,
  createApiTokenAction,
  revokeApiTokenAction,
} from '@/app/actions/api-tokens';
import type { ApiTokenSummary, ApiTokenScope } from '@/lib/api-tokens';
import { useToast } from '@/components/toast';
import { Button, Input, Select } from '@/components/ui';
import { SettingsNotice } from '@/components/settings-folio';
import styles from './settings-folio.module.css';

type Props = {
  active: boolean;
  signedIn: boolean;
};

export function ApiTokensSection({ active, signedIn }: Props) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiTokenScope>('read-write');
  const [busy, setBusy] = useState(false);
  const [freshPlaintext, setFreshPlaintext] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTokens(await listApiTokensAction());
      setLoaded(true);
    } catch {
      // Anonymous / signed-out: leave the list empty and unloaded.
    }
  }, []);

  useEffect(() => {
    if (active && signedIn && !loaded) void load();
  }, [active, signedIn, loaded, load]);

  const onCreate = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { plaintext, token } = await createApiTokenAction(name, scope);
      setFreshPlaintext(plaintext);
      setTokens((t) => [token, ...t]);
      setName('');
      setScope('read-write');
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Couldn’t create token',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: string) => {
    setBusy(true);
    try {
      await revokeApiTokenAction(id);
      setTokens((t) => t.filter((x) => x.id !== id));
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Couldn’t revoke token',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const copyFresh = () => {
    if (freshPlaintext) void navigator.clipboard?.writeText(freshPlaintext);
    toast({ variant: 'success', title: 'Copied to clipboard' });
  };

  return (
    <div>
      <p className={styles.tokenHint}>
        Connect your own agent to build trips over the REST API. Create a
        token, then send it as <code>Authorization: Bearer &lt;token&gt;</code>.
      </p>

      {!signedIn ? (
        <SettingsNotice>
          Sign in to create or revoke your personal API tokens.
        </SettingsNotice>
      ) : null}

      {freshPlaintext ? (
        <div className={styles.apiReveal} role="status">
          <div className={styles.apiRevealLabel}>
            Copy this now — it won’t be shown again.
          </div>
          <code className={styles.apiRevealCode}>{freshPlaintext}</code>
          <div className={styles.apiRevealActions}>
            <Button type="button" variant="outline" onClick={copyFresh}>
              Copy
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFreshPlaintext(null)}
            >
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {signedIn ? (
        <div className={styles.tokenCreateRow}>
          <Input
            type="text"
            className={styles.tokenInput}
            placeholder="Token name (e.g. my-agent)"
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
            aria-label="Token scope"
          >
            <option value="read-write">Read &amp; write</option>
            <option value="read">Read only</option>
          </Select>
          <Button
            type="button"
            onClick={onCreate}
            disabled={busy || !name.trim()}
          >
            Create token
          </Button>
        </div>
      ) : null}

      {tokens.length > 0 ? (
        <ul className={styles.tokenList}>
          {tokens.map((t) => (
            <li key={t.id} className={styles.tokenRow}>
              <div>
                <div className={styles.tokenName}>{t.name}</div>
                <div className={styles.tokenMeta}>
                  {t.scope === 'read' ? 'Read only' : 'Read & write'}
                  {' · '}
                  {t.lastUsedAt
                    ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                    : 'Never used'}
                </div>
              </div>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => onRevoke(t.id)}
                disabled={busy}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : loaded ? (
        signedIn ? <p className={styles.tokenMeta}>No tokens yet.</p> : null
      ) : null}
    </div>
  );
}
