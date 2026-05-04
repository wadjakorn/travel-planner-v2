// Client-safe translator. Server pages compute the dict via lib/i18n,
// then pass it as a prop to client components. Components call
// makeT(dict) to get a t() function.

import en from '@/messages/en.json';

export type Dict = typeof en;
export type MessageKey = keyof typeof en;

export function makeT(dict: Dict) {
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    const tpl = dict[key] ?? key;
    if (!vars) return tpl;
    return tpl.replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
    );
  };
}
