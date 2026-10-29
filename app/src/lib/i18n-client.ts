// Client-safe i18n core: types + pure helpers. lib/i18n.ts (server-only)
// builds the dictionaries; client components translate via useT() from
// components/i18n-provider.tsx, never by importing the server module.

import en from '@/messages/en.json';

export type Lang = 'en' | 'th';
export type Dict = typeof en;
export type MessageKey = keyof typeof en;
type Vars = Record<string, string | number>;

const VAR = /\{(\w+)\}/g;

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(VAR, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function makeT(dict: Dict) {
  return (key: MessageKey, vars?: Vars): string => interpolate(dict[key] ?? key, vars);
}

/** Every English key, with the Thai value where it exists and is non-empty. */
export function withFallback(en: Dict, th: Partial<Dict>): Dict {
  const out = { ...en };
  for (const k of Object.keys(en) as MessageKey[]) {
    const v = th[k];
    if (typeof v === 'string' && v !== '') out[k] = v;
  }
  return out;
}

const PLURALS: Partial<Record<Lang, Intl.PluralRules>> = {};

/** `${base}_one` | `${base}_other` for n in lang (Thai has no singular). */
export function pluralKey(lang: Lang, base: string, n: number): MessageKey {
  const rules = (PLURALS[lang] ??= new Intl.PluralRules(lang));
  return `${base}_${rules.select(n) === 'one' ? 'one' : 'other'}` as MessageKey;
}

const ACCENTS: Record<string, string> = {
  a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', y: 'ý',
  A: 'Å', E: 'É', I: 'Î', O: 'Ö', U: 'Ü', C: 'Ç', N: 'Ñ', Y: 'Ý',
};

/** Dev pseudo-locale: ⟦áccéñtéd + ~30% padding⟧, {vars} untouched. Makes
 *  un-extracted English (plain text) and clipping (+30% length) visible. */
export function pseudoLocalize(s: string): string {
  const body = s
    .split(/(\{\w+\})/)
    .map((part) => (/^\{\w+\}$/.test(part) ? part : part.replace(/[A-Za-z]/g, (c) => ACCENTS[c] ?? c)))
    .join('');
  return `⟦${body}${'·'.repeat(Math.ceil(s.length * 0.3))}⟧`;
}

/** Sorted unique {var} names in a template. */
export function placeholders(s: string): string[] {
  return [...new Set(Array.from(s.matchAll(VAR), (m) => m[1]))].sort();
}
