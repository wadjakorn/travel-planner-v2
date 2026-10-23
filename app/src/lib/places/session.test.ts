import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionHolder, newSessionToken, parseFieldsParam, parseSessionParam } from './session';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('newSessionToken', () => {
  it('is a v4 uuid and differs per call', () => {
    const a = newSessionToken();
    expect(a).toMatch(V4);
    expect(newSessionToken()).not.toBe(a);
  });
  it('works with only getRandomValues (no randomUUID)', () => {
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => { b.fill(255); return b; } });
    expect(newSessionToken()).toMatch(V4);
  });
});

describe('createSessionHolder', () => {
  const mk = () => { let n = 0; return createSessionHolder(() => `t${++n}`); };
  it('get is lazy and stable', () => {
    const h = mk();
    expect(h.get()).toBe('t1');
    expect(h.get()).toBe('t1');
  });
  it('take returns and clears synchronously; next get is new', () => {
    const h = mk();
    h.get();
    expect(h.take()).toBe('t1');
    expect(h.take()).toBeNull();
    expect(h.get()).toBe('t2');
  });
  it('take before any get is null', () => {
    expect(mk().take()).toBeNull();
  });
  it('reset clears', () => {
    const h = mk();
    h.get();
    h.reset();
    expect(h.get()).toBe('t2');
  });
});

describe('param parsers', () => {
  it('parseSessionParam keeps only v4 uuids', () => {
    const t = newSessionToken();
    expect(parseSessionParam(t)).toBe(t);
    expect(parseSessionParam(t.toUpperCase())).toBe(t.toUpperCase());
    expect(parseSessionParam('abc')).toBeNull();
    expect(parseSessionParam(null)).toBeNull();
    expect(parseSessionParam(`${t}&x=1`)).toBeNull();
  });
  it('parseFieldsParam', () => {
    expect(parseFieldsParam('full')).toBe('full');
    expect(parseFieldsParam('basic')).toBe('basic');
    expect(parseFieldsParam('../x')).toBe('basic');
    expect(parseFieldsParam(null)).toBe('basic');
  });
});
