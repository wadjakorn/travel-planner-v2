// Accept-Language parsing for the language fallback (TP-0074). Pure: the
// resolution order lives in lang-resolve.ts and getLang() (i18n.ts) reads the
// request; the landing now uses getLang() like the rest of the app.
import type { Lang } from '@/lib/i18n-client';

const SUPPORTED: readonly Lang[] = ['en', 'th'];

export function isLang(v: string | null | undefined): v is Lang {
  return !!v && (SUPPORTED as readonly string[]).includes(v);
}

/** Highest-q supported language in an Accept-Language header, else 'en'. */
export function langFromAcceptLanguage(header: string | null): Lang {
  if (!header) return 'en';
  let best: { lang: Lang; q: number } | null = null;
  for (const part of header.split(',')) {
    const [tag, ...params] = part.trim().split(';');
    const base = tag.trim().toLowerCase().split('-')[0];
    if (!isLang(base)) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { lang: base, q };
  }
  return best?.lang ?? 'en';
}
