// Shared test helpers for design-token guards (design roadmap: created by the
// first of ds-foundations / map-pin-redesign / hex-codemod to land). Lives
// outside src/ so vitest's `src/**/*.test.ts` include never runs it.
import { readFileSync } from 'node:fs';

const GLOBALS = new URL('../src/app/globals.css', import.meta.url);

export function readGlobals(): string {
  return readFileSync(GLOBALS, 'utf8');
}

type Selector = ':root' | '[data-theme="dark"]';

function blockOf(css: string, selector: Selector): string {
  // Anchored at line start and followed directly by `{`, so compound selectors
  // like `[data-theme="dark"] .tp-on-muted` are not picked up.
  const esc = selector.replace(/[[\]"=]/g, (c) => `\\${c}`);
  const m = new RegExp(`^${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!m) throw new Error(`globals.css: no "${selector}" block`);
  return m[1].replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseDecls(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Custom properties declared in the exact `selector` block of globals.css.
 * `var(--x)` is resolved against `:root`; hex colors come back lower-case,
 * other values verbatim.
 */
export function rootTokens(selector: Selector = ':root'): Record<string, string> {
  const css = readGlobals();
  const root = parseDecls(blockOf(css, ':root'));
  const own = selector === ':root' ? root : parseDecls(blockOf(css, selector));
  const resolve = (v: string, depth = 0): string => {
    const ref = /^var\((--[\w-]+)\)$/.exec(v);
    if (ref && depth < 10 && root[ref[1]] !== undefined) return resolve(root[ref[1]], depth + 1);
    return HEX.test(v) ? v.toLowerCase() : v;
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(own)) out[k] = resolve(v);
  return out;
}

function luminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio for `#rgb` / `#rrggbb`. */
export function contrast(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) throw new Error(`contrast: not a hex color (${a}, ${b})`);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
