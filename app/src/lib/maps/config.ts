import 'server-only';
import type { ClientMapsConfig } from './client-config';

export type MapsConfig = {
  provider: 'google' | 'open';
  /** always equals provider === 'google' */
  googlePlaces: boolean;
  staticMap: 'google' | 'geoapify' | null;
  geoapifyKey: string;
  /** non-null iff provider === 'google' */
  browser: { key: string; mapId: string } | null;
  google: {
    serverKey: string;
    signingSecret: string;
    caps: { full: number; basic: number; autocomplete: number; refresh: number; refreshManual: number };
    fake: boolean;
  };
};

type Env = Record<string, string | undefined>;

function cap(raw: string | undefined, fallback: number): number {
  const v = raw?.trim();
  if (!v || !/^\d+$/.test(v)) return fallback;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function readMapsConfig(
  env: Env = process.env,
  warn: (m: string) => void = console.warn,
): MapsConfig {
  const isProd = env.NODE_ENV === 'production';
  const serverKey = env.GOOGLE_MAPS_API_KEY?.trim() ?? '';
  const signingSecret = env.GOOGLE_MAPS_URL_SIGNING_SECRET?.trim() ?? '';
  const geoapifyKey = env.GEOAPIFY_API_KEY?.trim() ?? '';
  const fake = !isProd && env.GOOGLE_PLACES_FAKE === '1';

  const caps = {
    full: cap(env.GOOGLE_PLACES_DETAILS_FULL_DAILY_CAP, 30),
    basic: cap(env.GOOGLE_PLACES_DETAILS_BASIC_DAILY_CAP, 80),
    autocomplete: cap(env.GOOGLE_PLACES_AUTOCOMPLETE_DAILY_CAP, 300),
    refresh: cap(env.GOOGLE_PLACES_REFRESH_DAILY_CAP, 20),
    refreshManual: cap(env.GOOGLE_PLACES_REFRESH_MANUAL_DAILY_CAP, 5),
  };

  const browserKey = env.GOOGLE_MAPS_BROWSER_KEY?.trim() ?? '';
  const mapId = env.GOOGLE_MAPS_MAP_ID?.trim() ?? '';

  const raw = (env.MAPS_PROVIDER ?? '').trim().toLowerCase();
  const wantsGoogle = raw === 'google';
  if (!wantsGoogle && raw !== '' && raw !== 'open') {
    warn(`MAPS_PROVIDER="${env.MAPS_PROVIDER}" is not "google" or "open"; using open`);
  }

  const fallbackStatic = geoapifyKey ? ('geoapify' as const) : null;
  const open = (): MapsConfig => ({
    provider: 'open',
    googlePlaces: false,
    staticMap: fallbackStatic,
    geoapifyKey,
    browser: null,
    google: { serverKey: '', signingSecret: '', caps, fake },
  });

  if (!wantsGoogle) return open();

  if (env.VERCEL_ENV === 'preview') {
    warn('MAPS_PROVIDER=google ignored on Vercel Preview; using open');
    return open();
  }

  const missing: string[] = [];
  if (!fake) {
    if (!serverKey) missing.push('GOOGLE_MAPS_API_KEY');
    if (!signingSecret) missing.push('GOOGLE_MAPS_URL_SIGNING_SECRET');
  }
  if (!browserKey) missing.push('GOOGLE_MAPS_BROWSER_KEY');
  if (!mapId) missing.push('GOOGLE_MAPS_MAP_ID');
  if (missing.length > 0) {
    warn(`MAPS_PROVIDER=google needs ${missing.join(', ')}; using open`);
    return open();
  }

  return {
    provider: 'google',
    googlePlaces: true,
    staticMap: serverKey && signingSecret ? 'google' : fallbackStatic,
    geoapifyKey,
    browser: { key: browserKey, mapId },
    google: { serverKey, signingSecret, caps, fake },
  };
}

export function toClientMapsConfig(cfg: MapsConfig): ClientMapsConfig {
  if (cfg.provider !== 'google' || !cfg.browser) return { renderer: 'maplibre', browserKey: '', mapId: '' };
  return { renderer: 'google', browserKey: cfg.browser.key, mapId: cfg.browser.mapId };
}

export const MAPS_CONFIG: MapsConfig = readMapsConfig(process.env);
