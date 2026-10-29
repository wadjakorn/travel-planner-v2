'use client';

// Trip-scoped error boundary — keeps the shell and offers an inline retry
// instead of bubbling to the global error page.

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, buttonClasses } from '@/components/ui';
import { useT } from '@/components/i18n-provider';

export default function TripError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Copy comes from the root layout's provider, never from the failed tree.
  const t = useT();
  useEffect(() => {
    console.error('[trip-error]', error.digest, error.message);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16 text-center">
      <Card className="p-8 shadow-[var(--shadow-sm)]">
        <h1 className="text-lg font-semibold text-foreground">
          {t('err_trip_title')}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {/* Never error.message: in production it is Next's redaction text. */}
          {t('err_trip_body_fallback')}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted/70">{t('err_ref', { ref: error.digest })}</p>
        ) : null}
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button type="button" onClick={reset} className="rounded-full">
            {t('try_again')}
          </Button>
          <Link href="/" className={buttonClasses('ghost', 'md', 'rounded-full')}>
            {t('nav_all_trips')}
          </Link>
        </div>
      </Card>
    </main>
  );
}
