import { describe, it, expect } from 'vitest';
import { safeCallbackPath } from './safe-redirect';

describe('safeCallbackPath', () => {
  it('keeps a same-origin relative path', () => {
    expect(safeCallbackPath('/invite/abc')).toBe('/invite/abc');
    expect(safeCallbackPath('/')).toBe('/');
  });

  it('preserves a query string', () => {
    expect(safeCallbackPath('/invite/a?x=1')).toBe('/invite/a?x=1');
  });

  it('falls back on empty input', () => {
    expect(safeCallbackPath('')).toBe('/');
    expect(safeCallbackPath(null)).toBe('/');
    expect(safeCallbackPath(undefined)).toBe('/');
  });

  // These assert what *our* helper does. Auth.js would not have leaked here
  // either (@auth/core/lib/init.js clamps off-origin) — do not read them as a
  // claim about Auth.js.
  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeCallbackPath('https://evil.com')).toBe('/');
    expect(safeCallbackPath('//evil.com')).toBe('/');
    expect(safeCallbackPath('/\\evil.com')).toBe('/');
  });

  it('rejects control characters and traversal', () => {
    expect(safeCallbackPath('/a\nb')).toBe('/');
    expect(safeCallbackPath('/../x')).toBe('/');
  });

  it('rejects reserved paths that would loop or are not pages', () => {
    expect(safeCallbackPath('/sign-in')).toBe('/');
    expect(safeCallbackPath('/sign-in/not-invited')).toBe('/');
    expect(safeCallbackPath('/sign-in?callbackUrl=%2F')).toBe('/');
    expect(safeCallbackPath('/api/auth/signout')).toBe('/');
  });
});
