import { describe, expect, it, vi } from 'vitest';
import { degradeOnce, degradedLogLine } from './degraded';

describe('degradeOnce', () => {
  it('logs the first reason once and degrades once', () => {
    const log = vi.fn();
    const onDegrade = vi.fn();
    const mark = degradeOnce(log, onDegrade);
    mark('auth');
    mark('render_error', new Error('x'));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe(degradedLogLine('auth'));
    expect(onDegrade).toHaveBeenCalledTimes(1);
    expect(onDegrade).toHaveBeenCalledWith('auth');
  });

  it('passes the detail through', () => {
    const log = vi.fn();
    const err = new Error('boom');
    degradeOnce(log, () => {})('load_error', err);
    expect(log).toHaveBeenCalledWith(degradedLogLine('load_error'), err);
  });

  it('disabled (open mode) never logs or degrades', () => {
    const log = vi.fn();
    const onDegrade = vi.fn();
    const mark = degradeOnce(log, onDegrade, { enabled: false });
    mark('render_error');
    mark('auth');
    expect(log).not.toHaveBeenCalled();
    expect(onDegrade).not.toHaveBeenCalled();
  });

  it('log line names the reason', () => {
    expect(degradedLogLine('auth')).toBe('[maps] Google Maps unavailable (auth); using the backup map');
  });
});
