import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/feature-flags', () => ({ FEATURE_FLAGS: { authBypass: false } }));

import { hasSessionCookie } from './session-cookie';

describe('hasSessionCookie', () => {
  it('spots the plain, __Secure- and chunked Auth.js session cookies', () => {
    expect(hasSessionCookie(['theme', 'authjs.session-token'])).toBe(true);
    expect(hasSessionCookie(['__Secure-authjs.session-token'])).toBe(true);
    expect(hasSessionCookie(['__Secure-authjs.session-token.0'])).toBe(true);
  });

  it('ignores the other Auth.js cookies and lookalikes', () => {
    expect(hasSessionCookie([])).toBe(false);
    expect(hasSessionCookie(['theme', 'authjs.csrf-token', 'authjs.callback-url'])).toBe(false);
    expect(hasSessionCookie(['xauthjs.session-token', 'authjs.session-token-old'])).toBe(false);
  });
});
