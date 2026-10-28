// Cheap "probably signed in" hint: is an Auth.js session cookie present?
// Presence only — no DB lookup, so it can run in the root layout on every
// request for free. Never use it for access control; `auth()` is the truth.
// Matches `authjs.session-token`, its `__Secure-` variant, and chunked
// `.0`/`.1` parts.
import { FEATURE_FLAGS } from '@/lib/feature-flags';

const SESSION_COOKIE = /(^|-)authjs\.session-token(\.\d+)?$/;

export function hasSessionCookie(names: Iterable<string>): boolean {
  if (FEATURE_FLAGS.authBypass) return true;
  for (const n of names) if (SESSION_COOKIE.test(n)) return true;
  return false;
}
