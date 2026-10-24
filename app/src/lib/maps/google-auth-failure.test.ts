import { describe, expect, it, vi } from 'vitest';
import { onGoogleAuthFailure } from './google-auth-failure';

type Host = { gm_authFailure?: () => void };

describe('onGoogleAuthFailure', () => {
  it('calls cb and any previous handler', () => {
    const prev = vi.fn();
    const cb = vi.fn();
    const host: Host = { gm_authFailure: prev };
    onGoogleAuthFailure(host, cb);
    host.gm_authFailure!();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(prev).toHaveBeenCalledTimes(1);
  });

  it('cleanup restores the previous handler', () => {
    const prev = vi.fn();
    const host: Host = { gm_authFailure: prev };
    onGoogleAuthFailure(host, vi.fn())();
    expect(host.gm_authFailure).toBe(prev);
    const bare: Host = {};
    onGoogleAuthFailure(bare, vi.fn())();
    expect(bare.gm_authFailure).toBeUndefined();
  });

  it('cleanup leaves a later handler alone', () => {
    const host: Host = {};
    const cleanup = onGoogleAuthFailure(host, vi.fn());
    const other = vi.fn();
    host.gm_authFailure = other;
    cleanup();
    expect(host.gm_authFailure).toBe(other);
  });
});
