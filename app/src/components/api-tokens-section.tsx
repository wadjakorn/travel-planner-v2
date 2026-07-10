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
import styles from './settings-modal.module.css';

export function ApiTokensSection({ open }: { open: boolean }) {
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
    if (open && !loaded) void load();
  }, [open, loaded, load]);

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
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>API access</h3>
      <p className={styles.apiHint}>
        Connect your own agent to build trips over the REST API. Create a
        token, then send it as <code>Authorization: Bearer &lt;token&gt;</code>.
      </p>

      {freshPlaintext ? (
        <div className={styles.apiReveal} role="status">
          <div className={styles.apiRevealLabel}>
            Copy this now — it won’t be shown again.
          </div>
          <code className={styles.apiRevealCode}>{freshPlaintext}</code>
          <div className={styles.apiRevealActions}>
            <button type="button" className={styles.btn} onClick={copyFresh}>
              Copy
            </button>
            <button
              type="button"
              className={styles.btn}
              onClick={() => setFreshPlaintext(null)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.apiCreateRow}>
        <input
          type="text"
          className={styles.apiInput}
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
        <select
          className={styles.apiInput}
          value={scope}
          onChange={(e) => setScope(e.target.value as ApiTokenScope)}
          aria-label="Token scope"
        >
          <option value="read-write">Read &amp; write</option>
          <option value="read">Read only</option>
        </select>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={onCreate}
          disabled={busy || !name.trim()}
        >
          Create token
        </button>
      </div>

      {tokens.length > 0 ? (
        <ul className={styles.apiList}>
          {tokens.map((t) => (
            <li key={t.id} className={styles.apiListRow}>
              <div>
                <div className={styles.apiTokenName}>{t.name}</div>
                <div className={styles.apiTokenMeta}>
                  {t.scope === 'read' ? 'Read only' : 'Read & write'}
                  {' · '}
                  {t.lastUsedAt
                    ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                    : 'Never used'}
                </div>
              </div>
              <button
                type="button"
                className={styles.btn}
                onClick={() => onRevoke(t.id)}
                disabled={busy}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : loaded ? (
        <p className={styles.apiTokenMeta}>No tokens yet.</p>
      ) : null}
    </section>
  );
}
