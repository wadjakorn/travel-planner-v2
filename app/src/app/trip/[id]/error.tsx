'use client';

// Trip-scoped error boundary — keeps the shell and offers an inline retry
// instead of bubbling to the global error page.

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, buttonClasses } from '@/components/ui';

export default function TripError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[trip-error]', error.digest, error.message);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16 text-center">
      <div className="rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-sm)]">
        <h1 className="text-lg font-semibold text-foreground">
          Couldn’t load this trip
        </h1>
        <p className="mt-2 text-sm text-muted">
          {error.message || 'Something went wrong while loading. Try again.'}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted/70">ref: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button type="button" onClick={reset} className="rounded-full">
            Try again
          </Button>
          <Link href="/" className={buttonClasses('ghost', 'md', 'rounded-full')}>
            All trips
          </Link>
        </div>
      </div>
    </main>
  );
}
