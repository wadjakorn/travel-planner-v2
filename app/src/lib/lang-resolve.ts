// Which language a request renders in (i18n Decision 3). The `lang` cookie is
// authoritative: Settings, the landing's EN/ไทย switch and sign-in (from the
// account row, lib/auth.ts) all write it. No session or DB read here — the
// root layout calls getLang() on every request and stays DB-free (TP-0072).
import type { Lang } from '@/lib/i18n-client';
import { isLang, langFromAcceptLanguage } from '@/lib/landing-lang';

export const LANG_COOKIE = 'lang';
export const LANG_COOKIE_OPTIONS = { path: '/', maxAge: 60 * 60 * 24 * 365 } as const;

/** Valid `lang` cookie → best supported Accept-Language → 'en'. */
export function resolveLangFrom(i: { cookie: string | undefined; acceptLanguage: string | null }): Lang {
  if (isLang(i.cookie)) return i.cookie;
  return langFromAcceptLanguage(i.acceptLanguage);
}
