'use client';

// Client translations. The root layout passes the same lang + dict the server
// renders with, so client and server text never disagree. Outside a provider
// (tests, portals rendered without the layout) the hooks fall back to English.

import { createContext, useContext, useMemo } from 'react';
import en from '@/messages/en.json';
import { makeT, pluralKey, type Dict, type Lang } from '@/lib/i18n-client';

type Vars = Record<string, string | number>;
type T = ReturnType<typeof makeT>;
type Value = { lang: Lang; t: T; tp: (base: string, n: number, vars?: Vars) => string };

// Built once per (lang, dict), so t and tp keep their identity across renders
// (safe in effect / memo deps).
function makeValue(lang: Lang, dict: Dict): Value {
  const t = makeT(dict);
  return { lang, t, tp: (base, n, vars) => t(pluralKey(lang, base, n), { n, ...vars }) };
}

const I18nContext = createContext<Value>(makeValue('en', en));

export function I18nProvider({
  lang,
  dict,
  children,
}: {
  lang: Lang;
  dict: Dict;
  children: React.ReactNode;
}) {
  const value = useMemo(() => makeValue(lang, dict), [lang, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext).t;
}

/** Plural-aware t(): `tp('itin_places', n)` reads itin_places_one / _other
 *  and passes `{n}` — use it instead of `n === 1 ? … : …`. */
export function useTp() {
  return useContext(I18nContext).tp;
}

export function useLang(): Lang {
  return useContext(I18nContext).lang;
}
