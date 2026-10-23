import 'server-only';

export type MapsConfig = {
  provider: 'google' | 'open';
  /** provider === 'google' && (serverKey || fake) */
  googlePlaces: boolean;
  staticMap: 'google' | 'geoapify' | null;
  geoapifyKey: string;
  google: {
    serverKey: string;
    signingSecret: string;
    caps: { full: number; basic: number; autocomplete: number };
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
  };

  const raw = (env.MAPS_PROVIDER ?? '').trim().toLowerCase();
  let provider: 'google' | 'open' = 'open';
  if (raw === 'google') provider = 'google';
  else if (raw !== '' && raw !== 'open') {
    warn(`MAPS_PROVIDER="${env.MAPS_PROVIDER}" is not "google" or "open"; using open`);
  }

  const fallbackStatic = geoapifyKey ? ('geoapify' as const) : null;
  const make = (p: 'google' | 'open', googlePlaces: boolean, staticMap: MapsConfig['staticMap']): MapsConfig => ({
    provider: p,
    googlePlaces,
    staticMap,
    geoapifyKey,
    google: { serverKey, signingSecret, caps, fake },
  });

  if (provider === 'google' && isProd) {
    // Stage A gate (Google ToS: no Places content on a non-Google map). Stage B deletes this rule.
    warn('MAPS_PROVIDER=google ignored in production: Google mode requires the Stage B renderer');
    return make('open', false, fallbackStatic);
  }

  if (provider === 'open') return make('open', false, fallbackStatic);

  const googlePlaces = !!serverKey || fake;
  if (!serverKey && !fake) {
    warn('MAPS_PROVIDER=google but GOOGLE_MAPS_API_KEY is missing; Places search uses the open providers');
  }
  if (serverKey && !signingSecret) {
    warn('GOOGLE_MAPS_URL_SIGNING_SECRET is missing; static maps fall back to Geoapify');
  }
  const staticMap = serverKey && signingSecret ? ('google' as const) : fallbackStatic;
  return make('google', googlePlaces, staticMap);
}

export const MAPS_CONFIG: MapsConfig = readMapsConfig(process.env);
