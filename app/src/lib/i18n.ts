// Server-side i18n: language + dictionaries. Client components translate via
// useT() (components/i18n-provider.tsx), fed by the root layout. Missing or
// empty Thai values fall back to English; I18N_PSEUDO=1 (dev only)
// pseudo-localises every value so un-extracted English stands out.
import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import {
  interpolate,
  pseudoLocalize,
  withFallback,
  type Dict,
  type Lang,
  type MessageKey,
} from '@/lib/i18n-client';
import { LANG_COOKIE, resolveLangFrom } from '@/lib/lang-resolve';

export type { Dict, Lang, MessageKey };
export { interpolate };

function buildDicts(): Record<Lang, Dict> {
  const dicts: Record<Lang, Dict> = { en, th: withFallback(en, th) };
  if (process.env.I18N_PSEUDO !== '1' || process.env.NODE_ENV === 'production') return dicts;
  const pseudo = (d: Dict) =>
    Object.fromEntries(Object.entries(d).map(([k, v]) => [k, pseudoLocalize(v)])) as Dict;
  return { en: pseudo(dicts.en), th: pseudo(dicts.th) };
}

// Built once here (not in getDict) because tFor/tServer read DICTS directly.
const DICTS = buildDicts();

/** The request's language: `lang` cookie → Accept-Language → 'en'
 *  (lang-resolve.ts). No auth()/DB read: the root layout awaits this on every
 *  request. I18N_FORCE_EN=1 pins English (rollback without a revert). */
export const getLang = cache(async (): Promise<Lang> => {
  if (process.env.I18N_FORCE_EN === '1') return 'en';
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return resolveLangFrom({
    cookie: jar.get(LANG_COOKIE)?.value,
    acceptLanguage: h.get('accept-language'),
  });
});

export async function getDict(): Promise<Dict> {
  return DICTS[await getLang()];
}

/** Translator for an explicit language — e.g. a toast in the language a
 *  settings save just switched to, before the request's cookie changes. */
export function tFor(lang: Lang) {
  const dict = DICTS[lang];
  return (key: MessageKey, vars?: Record<string, string | number>): string =>
    interpolate(dict[key], vars);
}

// Server t(). Pages use it as `const t = await tServer(); t('itinerary')`.
export async function tServer() {
  return tFor(await getLang());
}
