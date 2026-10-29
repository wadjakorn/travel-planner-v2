// Design-system foundation guards (review DS-01): token contrast plus source
// scans that keep fixed values from drifting back. Helpers live in app/test/.
import { describe, expect, it } from 'vitest';
import { contrast, readGlobals, rootTokens } from '../../test/css-tokens';
import { readSrc, srcFiles } from '../../test/src-files';

describe('tokens: WCAG contrast (review A2/A3/A4)', () => {
  const t = rootTokens(':root');
  it('focus ring ≥ 3:1 on page and surface-2', () => {
    expect(contrast(t['--ring'], t['--background'])).toBeGreaterThanOrEqual(3);
    expect(contrast(t['--ring'], t['--surface-2'])).toBeGreaterThanOrEqual(3);
  });
  it('field border ≥ 3:1 on surface and surface-2', () => {
    expect(contrast(t['--input'], t['--surface'])).toBeGreaterThanOrEqual(3);
    expect(contrast(t['--input'], t['--surface-2'])).toBeGreaterThanOrEqual(3);
  });
  it('success works as text and as a fill', () => {
    expect(contrast(t['--success'], t['--surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--success-foreground'], t['--success'])).toBeGreaterThanOrEqual(4.5);
  });
  it('muted text stays ≥ 4.5:1 on surface-2 (regression)', () => {
    expect(contrast(t['--muted'], t['--surface-2'])).toBeGreaterThanOrEqual(4.5);
  });
  it('dark field border ≥ 3:1', () => {
    const d = rootTokens('[data-theme="dark"]');
    expect(contrast(d['--input'], d['--surface'])).toBeGreaterThanOrEqual(3);
  });
  it('defines --border-strong for decorative borders', () => {
    expect(t['--border-strong']).toBe('#d4d4d8');
  });
});

describe('fonts (review TL;DR #8)', () => {
  it('no platform font stacks in app source', () => {
    const hits = srcFiles(['.tsx', '.ts', '.css'])
      .filter((f) => /-apple-system|BlinkMacSystemFont/.test(f.text))
      .map((f) => f.rel);
    expect(hits).toEqual([]);
  });
});

/** `"<rel>::<selector>"` for every unitless `line-height` below 1.3 in a CSS module. */
function tightLineHeights(): string[] {
  return srcFiles(['.module.css']).flatMap((f) =>
    [...f.text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) =>
        [...body.matchAll(/line-height:\s*([\d.]+)\s*(?:;|$)/g)].some((m) => Number(m[1]) < 1.3))
      .map(([, sel]) => `${f.rel}::${sel.trim()}`));
}

describe('Thai type (review §0 #8, A8)', () => {
  it('leading tokens meet the Thai floor', () => {
    const t = rootTokens(':root');
    expect(Number(t['--leading-body'])).toBeGreaterThanOrEqual(1.5);
    expect(Number(t['--leading-heading'])).toBeGreaterThanOrEqual(1.3);
    const css = readGlobals();
    const th = css.match(/\[lang\|='th'\]\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(Number(th.match(/--leading-body:\s*([\d.]+)/)?.[1])).toBeGreaterThanOrEqual(1.5);
    expect(Number(th.match(/--leading-heading:\s*([\d.]+)/)?.[1])).toBeGreaterThanOrEqual(1.3);
    expect(css).toMatch(/:is\(h1, h2, h3, h4\):lang\(th\)\s*\{\s*line-height:\s*var\(--leading-heading\)/);
    for (const sz of ['xs', 'sm', 'base', 'lg']) {
      expect(th).toMatch(new RegExp(`--text-${sz}--line-height:\\s*var\\(--leading-body\\)`));
    }
    for (const sz of ['xl', '2xl']) {
      expect(th).toMatch(new RegExp(`--text-${sz}--line-height:\\s*var\\(--leading-heading\\)`));
    }
  });
  it('no module sets a unitless line-height < 1.3 outside the allowlist', () => {
    const ALLOW = new Set([
      'components/bookings-view.module.css::.bpCode', // Latin IATA code
      'components/bookings-view.module.css::.title', // static EN display heading
      'components/settings-folio.module.css::.pageTitle',
      'components/settings-folio.module.css::.paneTitle',
      'components/settings-folio.module.css::.stubV',
      'components/pin-card.module.css::.close', // icon-only button, no text
      'components/map-pin.module.css::.num', // stop number digits
    ]);
    expect(tightLineHeights().filter((k) => !ALLOW.has(k))).toEqual([]);
  });
  it('root layout derives <html lang> from getLang()', () => {
    const src = readSrc('app/layout.tsx');
    expect(src).not.toMatch(/lang="en"/);
    expect(src).toMatch(/<html[^>]*\blang=\{lang\}/);
    // Shape-agnostic: i18n P0 rewrites this to `const [lang, dict] = await Promise.all([getLang(), getDict()])`.
    expect(src).toMatch(/\bgetLang\(\)/);
  });
});

describe('text size (review A7)', () => {
  it('no text below 12px', () => {
    const EXEMPT = /(^|\/)opengraph-image\.tsx$/; // Satori raster, not DOM text
    // fontSize: whole expression up to , or } so ternaries (`compact ? 10 : 12`)
    // and quoted px strings ('11px') are caught too.
    const re = /font-size:\s*([\d.]+)px|text-\[([\d.]+)px\]|fontSize:\s*([^,}\n]+)/g;
    const hits = srcFiles(['.css', '.tsx', '.ts'])
      .filter((f) => !EXEMPT.test(f.rel))
      .flatMap((f) => [...f.text.matchAll(re)]
        .flatMap((m) => m[3] !== undefined
          ? [...m[3].matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)(?:px)?\b(?!\s*(?:rem|em|%))/g)].map((n) => Number(n[1]))
          : [Number(m[1] ?? m[2])])
        .filter((px) => px < 12)
        .map((px) => `${f.rel}:${px}`));
    expect(hits).toEqual([]);
  });
});

describe('layout + motion tokens (review §6 Spacing/Motion)', () => {
  it('header offset only via --header-h', () => {
    const hits = srcFiles(['.css', '.tsx', '.ts'])
      .filter((f) => f.rel !== 'app/globals.css' && /\b57px\b/.test(f.text))
      .map((f) => f.rel);
    expect(hits).toEqual([]);
    expect(rootTokens(':root')['--header-h']).toBe('57px');
  });
  it('CSS-module transitions use motion tokens', () => {
    const hits = srcFiles(['.module.css'])
      .flatMap((f) => f.text.split('\n').map((l, i) => [l, i + 1] as const)
        .filter(([l]) => /transition[\w-]*\s*:[^;]*\b\d*\.?\d+m?s\b/.test(l))
        .map(([, n]) => `${f.rel}:${n}`));
    expect(hits).toEqual([]);
  });
  it('motion tokens exist', () => {
    const t = rootTokens(':root');
    expect([t['--dur-fast'], t['--dur-base'], t['--dur-slow']]).toEqual(['120ms', '180ms', '280ms']);
    expect(t['--ease']).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)');
  });
});
