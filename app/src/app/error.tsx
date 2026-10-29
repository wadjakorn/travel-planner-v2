'use client';

import { useEffect } from 'react';
import { Button, Card } from '@/components/ui';
import { useT } from '@/components/i18n-provider';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Copy comes from the root layout's provider, never from the failed tree.
  const t = useT();
  useEffect(() => {
    // Telemetry hook — Phase 11 wires real provider.
    console.error('[global-error]', error.digest, error.message);
  }, [error]);

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <Card className="p-8 shadow-[var(--shadow-sm)]">
        <h1 className="text-xl font-semibold text-foreground">
          {t('err_title')}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {/* Never error.message: in production it is Next's redaction text. */}
          {t('err_body_fallback')}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted/70">
            {t('err_ref', { ref: error.digest })}
          </p>
        ) : null}
        <Button type="button" onClick={reset} className="mt-5 rounded-full">
          {t('try_again')}
        </Button>
      </Card>
    </main>
  );
}
