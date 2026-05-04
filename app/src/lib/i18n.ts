// Minimal i18n. Server-side: read cookie, return dictionary + tagged
// translator. Client-side: components receive a Dict prop and call its
// translator. Supports {n} interpolation. Plurals + dates roll out in
// Phase 11 (swap to next-intl).

// FUTURE ENHANCE: re-enable per-user locale (lang cookie). Forced 'en' for now.
import 'server-only';
import en from '@/messages/en.json';
import th from '@/messages/th.json';

export type Lang = 'en' | 'th';
export type Dict = typeof en;
export type MessageKey = keyof typeof en;

const DICTS: Record<Lang, Dict> = { en, th: th as Dict };

export async function getLang(): Promise<Lang> {
  return 'en';
}

export async function getDict(): Promise<Dict> {
  return DICTS[await getLang()];
}

export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

// Server t(). Pages use it as `const t = await tServer(); t('itinerary')`.
export async function tServer() {
  const dict = await getDict();
  return (key: MessageKey, vars?: Record<string, string | number>): string =>
    interpolate(dict[key], vars);
}
