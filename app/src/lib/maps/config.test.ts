import { describe, expect, it, vi } from 'vitest';
import { readMapsConfig } from './config';

const KEYS = {
  GOOGLE_MAPS_API_KEY: 'S',
  GOOGLE_MAPS_URL_SIGNING_SECRET: 'X',
};

function read(env: Record<string, string | undefined>) {
  const warn = vi.fn();
  return { cfg: readMapsConfig(env, warn), warn };
}

describe('readMapsConfig', () => {
  it('defaults to open with nothing configured', () => {
    const { cfg, warn } = read({});
    expect(cfg.provider).toBe('open');
    expect(cfg.googlePlaces).toBe(false);
    expect(cfg.staticMap).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses geoapify static maps when its key is set', () => {
    const { cfg } = read({ GEOAPIFY_API_KEY: 'G' });
    expect(cfg.staticMap).toBe('geoapify');
    expect(cfg.geoapifyKey).toBe('G');
  });

  it('google with key and secret turns everything on (trimmed, case-insensitive)', () => {
    const { cfg, warn } = read({
      MAPS_PROVIDER: ' Google ',
      ...KEYS,
      NODE_ENV: 'development',
    });
    expect(cfg.provider).toBe('google');
    expect(cfg.googlePlaces).toBe(true);
    expect(cfg.staticMap).toBe('google');
    expect(warn).not.toHaveBeenCalled();
  });

  it('google without a key stays off and warns once', () => {
    const { cfg, warn } = read({ MAPS_PROVIDER: 'google', NODE_ENV: 'development' });
    expect(cfg.googlePlaces).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/GOOGLE_MAPS_API_KEY/);
  });

  it('Stage A gate: google in production is forced to open', () => {
    const { cfg, warn } = read({
      MAPS_PROVIDER: 'google',
      ...KEYS,
      NODE_ENV: 'production',
    });
    expect(cfg.provider).toBe('open');
    expect(cfg.googlePlaces).toBe(false);
    expect(cfg.staticMap).not.toBe('google');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/Stage B/);
  });

  it('google with a key but no secret falls back to geoapify/null for static maps', () => {
    const a = read({
      MAPS_PROVIDER: 'google',
      GOOGLE_MAPS_API_KEY: 'S',
      GEOAPIFY_API_KEY: 'G',
      NODE_ENV: 'development',
    });
    expect(a.cfg.googlePlaces).toBe(true);
    expect(a.cfg.staticMap).toBe('geoapify');
    expect(a.warn.mock.calls.some((c) => /SIGNING_SECRET/.test(c[0]))).toBe(true);

    const b = read({
      MAPS_PROVIDER: 'google',
      GOOGLE_MAPS_API_KEY: 'S',
      NODE_ENV: 'development',
    });
    expect(b.cfg.googlePlaces).toBe(true);
    expect(b.cfg.staticMap).toBeNull();
    expect(b.warn.mock.calls.some((c) => /SIGNING_SECRET/.test(c[0]))).toBe(true);
  });

  it('unknown provider means open and warns', () => {
    const { cfg, warn } = read({ MAPS_PROVIDER: 'gogle' });
    expect(cfg.provider).toBe('open');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/MAPS_PROVIDER/);
  });

  it('open ignores google keys', () => {
    const { cfg } = read({ ...KEYS });
    expect(cfg.googlePlaces).toBe(false);
    expect(cfg.staticMap).toBeNull();
  });

  describe('caps', () => {
    const caps = (v?: string) =>
      read({
        GOOGLE_PLACES_DETAILS_FULL_DAILY_CAP: v,
        GOOGLE_PLACES_DETAILS_BASIC_DAILY_CAP: v,
        GOOGLE_PLACES_AUTOCOMPLETE_DAILY_CAP: v,
      }).cfg.google.caps;

    it('defaults when unset', () => {
      expect(caps()).toEqual({ full: 30, basic: 80, autocomplete: 300 });
    });
    it('accepts positive integers, including 1', () => {
      expect(caps('25')).toEqual({ full: 25, basic: 25, autocomplete: 25 });
      expect(caps('1')).toEqual({ full: 1, basic: 1, autocomplete: 1 });
    });
    it.each(['0', '-3', 'abc', '2.5'])('rejects %s', (v) => {
      expect(caps(v)).toEqual({ full: 30, basic: 80, autocomplete: 300 });
    });
  });

  describe('fake mode', () => {
    it('turns google on without a key outside production, no key warning', () => {
      const { cfg, warn } = read({
        MAPS_PROVIDER: 'google',
        GOOGLE_PLACES_FAKE: '1',
        NODE_ENV: 'development',
      });
      expect(cfg.googlePlaces).toBe(true);
      expect(cfg.google.fake).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    });
    it('is ignored in production', () => {
      const { cfg } = read({
        MAPS_PROVIDER: 'google',
        GOOGLE_PLACES_FAKE: '1',
        NODE_ENV: 'production',
      });
      expect(cfg.googlePlaces).toBe(false);
      expect(cfg.google.fake).toBe(false);
    });
  });
});
