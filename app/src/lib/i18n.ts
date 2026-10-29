// Server-side i18n: language + dictionaries. Client components translate via
// useT() (components/i18n-provider.tsx), fed by the root layout. Missing or
// empty Thai values fall back to English; I18N_PSEUDO=1 (dev only)
// pseudo-localises every value so un-extracted English stands out.

// FUTURE ENHANCE: re-enable per-user locale (lang cookie). Forced 'en' for now.
import 'server-only';
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

export async function getLang(): Promise<Lang> {
  return 'en';
}

export async function getDict(): Promise<Dict> {
  return DICTS[await getLang()];
}

/** Translator for an explicit language — for surfaces that pick their own
 *  (the signed-out landing follows the visitor; see landing-lang.ts). */
export function tFor(lang: Lang) {
  const dict = DICTS[lang];
  return (key: MessageKey, vars?: Record<string, string | number>): string =>
    interpolate(dict[key], vars);
}

// Server t(). Pages use it as `const t = await tServer(); t('itinerary')`.
export async function tServer() {
  return tFor(await getLang());
}
