// Pure post-login destination sanitiser. Same split as access-policy.ts /
// rate-limit-policy.ts: no `server-only`, no DB, unit-testable in isolation.
//
// Where this is load-bearing: Auth.js already clamps off-origin destinations in
// its default `redirect` callback (@auth/core/lib/init.js), so the
// signIn(..., { redirectTo }) path is safe without us. The unguarded call is
// *our own* redirect(callbackUrl) in the sign-in page's already-signed-in early
// return, where Next.js would happily honour a protocol-relative //evil.com.

const FALLBACK = '/';

// /sign-in is excluded because the early return would otherwise loop forever:
// redirect('/sign-in') -> page re-runs -> session still present -> redirect.
// /api is excluded on principle: a landing page is a page, never an endpoint.
function isReservedPath(path: string): boolean {
  const p = path.split(/[?#]/)[0];
  return (
    p === '/sign-in' ||
    p.startsWith('/sign-in/') ||
    p === '/api' ||
    p.startsWith('/api/')
  );
}

export function safeCallbackPath(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;
  if (!raw.startsWith('/')) return FALLBACK;
  // Protocol-relative (//host, /\host) resolves off-origin.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return FALLBACK;
  // Control characters (incl. newline) can smuggle past naive parsers.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return FALLBACK;
  if (raw.includes('..')) return FALLBACK;
  if (isReservedPath(raw)) return FALLBACK;
  return raw;
}
