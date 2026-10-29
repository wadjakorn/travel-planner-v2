// Server-render probes (no DOM): the hooks read the context React gives them.
import { describe, expect, it } from 'vitest';
import { createElement, type ComponentProps, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import { readSrc } from '../../test/src-files';
import { I18nProvider, useLang, useT, useTp } from './i18n-provider';
import type { Dict, Lang } from '@/lib/i18n-client';

// children as the 3rd createElement argument (react/no-children-prop); the
// cast only tells TS that the props object gets them from there.
const provide = (lang: Lang, dict: Dict, child: ReactElement) =>
  createElement(I18nProvider, { lang, dict } as ComponentProps<typeof I18nProvider>, child);

function Probe() {
  const t = useT();
  const tp = useTp();
  return createElement('p', null, `${useLang()}|${t('save')}|${t('saved_min_ago', { n: 5 })}|${tp('missing', 1)}`);
}

describe('I18nProvider / useT', () => {
  it('outside a provider: English, never throws', () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<p>en|Save|5m ago|missing_one</p>');
  });

  it('inside a provider: the given language and dictionary', () => {
    const html = renderToStaticMarkup(provide('th', th as Dict, createElement(Probe)));
    expect(html).toBe(`<p>th|${th.save}|${th.saved_min_ago.replace('{n}', '5')}|missing_other</p>`);
  });

  it('useTp passes n and picks the plural form for the language', () => {
    const dict = { ...en, x_one: '{n} place', x_other: '{n} places in {city}' } as Dict;
    function Plural() {
      const tp = useTp();
      return createElement('p', null, `${tp('x', 1)}/${tp('x', 3, { city: 'Kyoto' })}`);
    }
    const html = renderToStaticMarkup(provide('en', dict, createElement(Plural)));
    expect(html).toBe('<p>1 place/3 places in Kyoto</p>');
  });
});

describe('root layout wiring (Review Focus 5)', () => {
  it('feeds I18nProvider the same lang the server renders with', () => {
    const src = readSrc('app/layout.tsx');
    expect(src).toMatch(/const \[lang, dict\] = await Promise\.all\(\[getLang\(\), getDict\(\)\]\)/);
    expect(src).toMatch(/<I18nProvider lang=\{lang\} dict=\{dict\}>/);
  });
});
