import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY = 'tp.mapLegs';

function fakeStorage(blocked = false) {
  const m = new Map<string, string>();
  const guard = () => {
    if (blocked) throw new Error('blocked');
  };
  return {
    getItem: (k: string) => (guard(), m.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void m.set(k, v)),
    removeItem: (k: string) => (guard(), void m.delete(k)),
  };
}

// The module keeps session state, so each test loads a fresh copy over its own storage.
async function load(blocked = false) {
  vi.resetModules();
  vi.stubGlobal('localStorage', fakeStorage(blocked));
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  return import('./legs-store');
}

afterEach(() => vi.unstubAllGlobals());

describe('legs store', () => {
  it('shows by default', async () => {
    const s = await load();
    expect(s.getLegsShown()).toBe(true);
  });

  it('toggle hides, stores "0" and notifies; toggling back removes the key', async () => {
    const s = await load();
    const cb = vi.fn();
    s.subscribeLegs(cb);
    s.toggleLegs();
    expect(s.getLegsShown()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('0');
    expect(cb).toHaveBeenCalledTimes(1);
    s.toggleLegs();
    expect(s.getLegsShown()).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('reads a stored "0" as hidden and anything else as shown', async () => {
    const s = await load();
    localStorage.setItem(KEY, '0');
    expect(s.getLegsShown()).toBe(false);
    localStorage.setItem(KEY, 'yes');
    expect(s.getLegsShown()).toBe(true);
  });

  it('blocked storage still toggles for the page session', async () => {
    const s = await load(true);
    expect(s.getLegsShown()).toBe(true);
    s.toggleLegs();
    expect(s.getLegsShown()).toBe(false);
    s.toggleLegs();
    expect(s.getLegsShown()).toBe(true);
  });
});
