'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Telemetry hook — Phase 11 wires real provider.
    console.error('[global-error]', error.digest, error.message);
  }, [error]);

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-sm)]">
        <h1 className="text-xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted">
          {error.message || 'Unexpected error. Please retry.'}
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted/70">
            ref: {error.digest}
          </p>
        ) : null}
        <Button type="button" onClick={reset} className="mt-5 rounded-full">
          Try again
        </Button>
      </div>
    </main>
  );
}
