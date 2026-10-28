import { describe, expect, it, vi } from 'vitest';
import { readMapsConfig, toClientMapsConfig } from './config';
import { OPEN_CLIENT_CONFIG } from './client-config';

const KEYS = {
  GOOGLE_MAPS_API_KEY: 'S',
  GOOGLE_MAPS_URL_SIGNING_SECRET: 'X',
  GOOGLE_MAPS_BROWSER_KEY: 'B',
  GOOGLE_MAPS_MAP_ID: 'M',
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

  it('google with all four in production turns everything on', () => {
    const { cfg, warn } = read({ MAPS_PROVIDER: 'google', ...KEYS, NODE_ENV: 'production' });
    expect(cfg.provider).toBe('google');
    expect(cfg.googlePlaces).toBe(true);
    expect(cfg.staticMap).toBe('google');
    expect(cfg.browser).toEqual({ key: 'B', mapId: 'M' });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    'GOOGLE_MAPS_API_KEY',
    'GOOGLE_MAPS_URL_SIGNING_SECRET',
    'GOOGLE_MAPS_BROWSER_KEY',
    'GOOGLE_MAPS_MAP_ID',
  ])('google needs all four: missing %s', (name) => {
    const env: Record<string, string> = { MAPS_PROVIDER: 'google', ...KEYS, GEOAPIFY_API_KEY: 'G', NODE_ENV: 'production' };
    delete env[name];
    const { cfg, warn } = read(env);
    expect(cfg.provider).toBe('open');
    expect(cfg.googlePlaces).toBe(false);
    expect(cfg.staticMap).toBe('geoapify');
    expect(cfg.browser).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(name);
  });

  describe('preview stays open', () => {
    it('without google config: open, no warning', () => {
      const { cfg, warn } = read({ NODE_ENV: 'production', VERCEL_ENV: 'preview', GEOAPIFY_API_KEY: 'G' });
      expect(cfg.provider).toBe('open');
      expect(cfg.staticMap).toBe('geoapify');
      expect(cfg.browser).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });
    it('with leaked google config: open, one warning', () => {
      const { cfg, warn } = read({
        NODE_ENV: 'production', VERCEL_ENV: 'preview', GEOAPIFY_API_KEY: 'G', MAPS_PROVIDER: 'google', ...KEYS,
      });
      expect(cfg.provider).toBe('open');
      expect(cfg.staticMap).toBe('geoapify');
      expect(cfg.browser).toBeNull();
      expect(cfg.google.serverKey).toBe('');
      expect(cfg.google.signingSecret).toBe('');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/Preview/);
    });
    it('with nothing else: static map null, does not throw', () => {
      expect(read({ VERCEL_ENV: 'preview' }).cfg.staticMap).toBeNull();
    });
  });

  it('open blanks server secrets', () => {
    const { cfg } = read({ ...KEYS });
    expect(cfg.google.serverKey).toBe('');
    expect(cfg.google.signingSecret).toBe('');
    expect(cfg.browser).toBeNull();
  });

  describe('toClientMapsConfig', () => {
    it('maps the all-four production config', () => {
      const { cfg } = read({ MAPS_PROVIDER: 'google', ...KEYS, NODE_ENV: 'production' });
      expect(toClientMapsConfig(cfg)).toEqual({ renderer: 'google', browserKey: 'B', mapId: 'M' });
    });
    it('maps open to OPEN_CLIENT_CONFIG', () => {
      expect(toClientMapsConfig(read({}).cfg)).toEqual(OPEN_CLIENT_CONFIG);
    });
    it('never carries server secrets', () => {
      const { cfg } = read({
        MAPS_PROVIDER: 'google', ...KEYS,
        GOOGLE_MAPS_API_KEY: 'server-secret-S', GOOGLE_MAPS_URL_SIGNING_SECRET: 'signing-secret-X',
      });
      const json = JSON.stringify(toClientMapsConfig(cfg));
      expect(json).not.toContain('server-secret-S');
      expect(json).not.toContain('signing-secret-X');
    });
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
      expect(caps()).toMatchObject({ full: 30, basic: 80, autocomplete: 300 });
    });
    it('accepts positive integers, including 1', () => {
      expect(caps('25')).toMatchObject({ full: 25, basic: 25, autocomplete: 25 });
      expect(caps('1')).toMatchObject({ full: 1, basic: 1, autocomplete: 1 });
    });
    it.each(['0', '-3', 'abc', '2.5'])('rejects %s', (v) => {
      expect(caps(v)).toMatchObject({ full: 30, basic: 80, autocomplete: 300 });
    });
  });

  describe('preview + photo + photo-ref caps', () => {
    const pc = (e: Record<string, string | undefined>) => read({ ...KEYS, ...e, MAPS_PROVIDER: 'google' }).cfg.google.caps;
    it('defaults 150 / 100 / 500', () => {
      expect(pc({})).toMatchObject({ preview: 150, photo: 100, photoRef: 500 });
    });
    it('reads the env vars', () => {
      expect(pc({ GOOGLE_PLACES_DETAILS_PREVIEW_DAILY_CAP: '40', GOOGLE_PLACES_PHOTO_DAILY_CAP: '7', GOOGLE_PLACES_PHOTO_REF_DAILY_CAP: '9' })).toMatchObject({ preview: 40, photo: 7, photoRef: 9 });
    });
    it.each(['0', 'abc'])('rejects %s', (v) => {
      expect(pc({ GOOGLE_PLACES_DETAILS_PREVIEW_DAILY_CAP: v, GOOGLE_PLACES_PHOTO_DAILY_CAP: v, GOOGLE_PLACES_PHOTO_REF_DAILY_CAP: v })).toMatchObject({ preview: 150, photo: 100, photoRef: 500 });
    });
  });

  describe('refresh caps', () => {
    const rc = (e: Record<string, string | undefined>, google = true) =>
      read({ ...KEYS, ...e, MAPS_PROVIDER: google ? 'google' : 'open' }).cfg.google.caps;
    it('defaults 20 / 5', () => {
      expect(rc({})).toMatchObject({ refresh: 20, refreshManual: 5 });
    });
    it('accepts positive integers', () => {
      expect(rc({ GOOGLE_PLACES_REFRESH_DAILY_CAP: '5' }).refresh).toBe(5);
      expect(rc({ GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP: '3' }).refreshManual).toBe(3);
    });
    it.each(['0', 'abc', '2.5'])('rejects %s', (v) => {
      expect(rc({ GOOGLE_PLACES_REFRESH_DAILY_CAP: v }).refresh).toBe(20);
      expect(rc({ GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP: v }).refreshManual).toBe(5);
    });
    it('present in open mode too', () => {
      expect(rc({ GOOGLE_PLACES_REFRESH_DAILY_CAP: '7' }, false)).toMatchObject({ refresh: 7, refreshManual: 5 });
    });
  });

  describe('fake mode', () => {
    it('turns google on without a key outside production, no key warning', () => {
      const { cfg, warn } = read({
        MAPS_PROVIDER: 'google',
        GOOGLE_MAPS_BROWSER_KEY: 'B',
        GOOGLE_MAPS_MAP_ID: 'M',
        GOOGLE_PLACES_FAKE: '1',
        NODE_ENV: 'development',
      });
      expect(cfg.provider).toBe('google');
      expect(cfg.googlePlaces).toBe(true);
      expect(cfg.google.fake).toBe(true);
      expect(cfg.staticMap).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });
    it('still needs the browser key and map id', () => {
      const { cfg, warn } = read({ MAPS_PROVIDER: 'google', GOOGLE_PLACES_FAKE: '1', NODE_ENV: 'development' });
      expect(cfg.provider).toBe('open');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/GOOGLE_MAPS_BROWSER_KEY, GOOGLE_MAPS_MAP_ID/);
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
