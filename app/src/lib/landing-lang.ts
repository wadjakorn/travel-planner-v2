// Language for the signed-out landing (TP-0074). The app itself is still
// pinned to English (see getLang in i18n.ts); the landing is the one surface
// that follows the visitor: their saved `lang` cookie first (the same cookie
// Settings writes, and the landing's own EN/ไทย switch), else the browser's
// Accept-Language, else English.
import 'server-only';
import { cookies, headers } from 'next/headers';
import type { Lang } from '@/lib/i18n';

const SUPPORTED: readonly Lang[] = ['en', 'th'];

function isLang(v: string | undefined): v is Lang {
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

export async function getLandingLang(): Promise<Lang> {
  const saved = (await cookies()).get('lang')?.value;
  if (isLang(saved)) return saved;
  return langFromAcceptLanguage((await headers()).get('accept-language'));
}
