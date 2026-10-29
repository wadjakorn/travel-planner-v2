import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNavigationError, logActionFailure } from './action-errors';

describe('isNavigationError', () => {
  it('matches redirect()', () => {
    expect(isNavigationError({ digest: 'NEXT_REDIRECT;replace;/x;307;' })).toBe(true);
  });

  it('matches the legacy notFound digest', () => {
    expect(isNavigationError({ digest: 'NEXT_NOT_FOUND' })).toBe(true);
  });

  it('matches Next 16 notFound/forbidden/unauthorized', () => {
    expect(isNavigationError({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' })).toBe(true);
  });

  it('ignores ordinary errors and junk', () => {
    expect(isNavigationError(new Error('Invalid idx'))).toBe(false);
    expect(isNavigationError(null)).toBe(false);
    expect(isNavigationError(undefined)).toBe(false);
    expect(isNavigationError({ digest: 42 })).toBe(false);
    expect(isNavigationError({ digest: 'NEXT_NOT_FOUND_ISH' })).toBe(false);
  });

  it('matches an Error carrying a navigation digest', () => {
    const err = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/y;303;' });
    expect(isNavigationError(err)).toBe(true);
  });
});

describe('logActionFailure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs context, digest and message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logActionFailure('reorder', Object.assign(new Error('boom'), { digest: 'abc' }));
    expect(spy).toHaveBeenCalledWith('[action]', 'reorder', 'abc', 'boom');
  });

  it('tolerates non-Error values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logActionFailure('note', 'nope');
    expect(spy).toHaveBeenCalledWith('[action]', 'note', undefined, 'nope');
  });
});
