// The i18n lint ratchet (eslint.config.mjs I18N_DONE): what it flags, what it
// leaves alone, and that unlisted files stay unaffected until i18n P6.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { I18N_DONE } from '../../eslint.config.mjs';

const APP = fileURLToPath(new URL('../../', import.meta.url));
const GUARDED = 'src/components/trip-rail.tsx';

const wrap = (body: string) => `'use client';
declare const a: boolean, x: string, n: number;
declare const t: (k: string, v?: object) => string, tp: (k: string, n: number) => string, fmt: (s: string) => string;
declare const toast: (o: { title: string; description?: string }) => void;
export function X() {
${body}
}
`;

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: APP });
});

async function i18nErrors(body: string, filePath = GUARDED) {
  const [r] = await eslint.lintText(wrap(body), { filePath: `${APP}${filePath}` });
  return r.messages.filter((m) => m.ruleId === 'react/jsx-no-literals' || m.ruleId === 'no-restricted-syntax');
}

describe('i18n lint ratchet', () => {
  it('every I18N_DONE entry is a real file (a rename would silently drop it)', () => {
    for (const f of I18N_DONE) expect(existsSync(`${APP}${f}`), f).toBe(true);
  });

  it.each([
    ['JSX text', 'return <p>Hello</p>;'],
    ['ternary in children', "return <p>{a ? 'Edit stay' : 'Add stay'}</p>;"],
    ['&& in children', "return <p>{a && 'Saved'}</p>;"],
    ['template attribute', 'return <button aria-label={`Remove ${x}`} />;'],
    ['conditional attribute', "return <button title={a ? 'Remove this ride?' : 'Remove this stay?'} />;"],
    ['toast title', "toast({ title: 'Saved' }); return null;"],
    ['literal in a non-t() call in an attribute', "return <i title={fmt('Remove this')} />;"],
    ['literal branch next to t() in an attribute', "return <i aria-label={a ? t('save') : 'Delete it'} />;"],
  ])('flags %s', async (_, body) => {
    expect(await i18nErrors(body)).not.toEqual([]);
  }, 20_000);

  it.each([
    ['className ternary', "return <p className={a ? 'flex' : 'hidden'}>{t('save')}</p>;"],
    // allowedStrings match a whole text node, not tokens inside one.
    ['brand', 'return <p>Traver Planel</p>;'],
    // The extracted form itself: the key argument of t()/tp() is not text.
    ['t() in text attributes', "return <i aria-label={t('save')} title={t('saved_min_ago', { n: 1 })} placeholder={tp('itin_places', n)} />;"],
    ['t() in toast', "toast({ title: t('save'), description: t('cancel') }); return null;"],
    ['separator between values', 'return <p>{x} · {x}</p>;'],
    ['className in .map()', "return <ul>{[1].map((n) => <li key={n} className={a ? 'flex' : 'hidden'}>{n}</li>)}</ul>;"],
  ])('allows %s', async (_, body) => {
    expect(await i18nErrors(body)).toEqual([]);
  }, 20_000);

  it('files not on I18N_DONE (e.g. a new file on another branch) are not guarded', async () => {
    expect(await i18nErrors('return <p>Hello</p>;', 'src/components/brand-new-widget.tsx')).toEqual([]);
  }, 20_000);
});
