// Client-side handling of a thrown server action (A18). In production Next
// replaces any thrown action error with a generic redaction message (see
// lib/action-result.ts), and in development the raw server string shows, so a
// surface never renders err.message: it shows fixed copy and logs the error.

/**
 * True for the control-flow "errors" Next throws to navigate (redirect(),
 * notFound(), forbidden(), unauthorized()). A catch must rethrow these.
 */
export function isNavigationError(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('digest' in err)) return false;
  const digest = (err as { digest: unknown }).digest;
  if (typeof digest !== 'string') return false;
  return (
    digest.startsWith('NEXT_REDIRECT') ||
    // Next 16 notFound()/forbidden()/unauthorized(): "NEXT_HTTP_ERROR_FALLBACK;404".
    digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;') ||
    digest === 'NEXT_NOT_FOUND' // legacy notFound()
  );
}

/** Logs a failed action for debugging; the user sees fixed copy instead. */
export function logActionFailure(context: string, err: unknown): void {
  const digest =
    err && typeof err === 'object' && 'digest' in err
      ? (err as { digest: unknown }).digest
      : undefined;
  const message = err instanceof Error ? err.message : String(err);
  console.error('[action]', context, digest, message);
}
