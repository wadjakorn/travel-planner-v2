// Raw-color ratchet (REQUIREMENTS §15: "no hardcoded hex outside token files").
// STRICT files hold zero raw colors; every other source file must match its
// count in raw-color-baseline.json exactly, so the total can only go down.
// Regenerate after an intended change:
//   UPDATE_RAW_COLOR_BASELINE=1 pnpm vitest run src/components/raw-color-guard.test.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, rootTokens } from '../../test/css-tokens';
import { readSrc, srcFiles } from '../../test/src-files';

const BASELINE = new URL('./raw-color-baseline.json', import.meta.url);
const REGEN = 'UPDATE_RAW_COLOR_BASELINE=1 pnpm vitest run src/components/raw-color-guard.test.ts';

// Paths relative to app/src.
const STRICT: string[] = [
  'components/itinerary-list.module.css',
  'components/itinerary-sidebar.module.css',
  'components/place-search-picker.module.css',
  'components/days-accordion.tsx',
  'components/spinner.tsx',
];

// globals.css is the token file; Satori (OG images) can't read CSS vars; seed
// colors are data stored in the DB.
const EXEMPT = [
  /^app\/globals\.css$/,
  /(^|\/)opengraph-image\.tsx$/,
  /^lib\/seed\//,
  /^lib\/seed-trip\.ts$/,
];

const RAW = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b|rgba?\(/g;
const PALETTE =
  /\b(?:[\w-]+:)*(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|placeholder|decoration|accent|caret)-(?:zinc|gray|slate|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?\b/g;

/** Raw hex / rgb() / rgba() occurrences; lines marked `hex-ok` are skipped. */
function countRaw(text: string): number {
  return text
    .split('\n')
    .filter((l) => !l.includes('hex-ok'))
    .reduce((n, l) => n + (l.match(RAW)?.length ?? 0), 0);
}

/** Tailwind default-palette color classes (e.g. `text-zinc-500`, `dark:bg-red-50/40`). */
function countPalette(text: string): number {
  return text.match(PALETTE)?.length ?? 0;
}

type Counts = Record<string, number>;
type Baseline = { raw: Counts; palette: Counts };
type Drift = { kind: keyof Baseline; file: string; count: number; allowed: number };

function scan(): Baseline {
  const out: Baseline = { raw: {}, palette: {} };
  for (const { rel, text } of srcFiles(['.css', '.tsx', '.ts'])) {
    if (EXEMPT.some((re) => re.test(rel))) continue;
    const raw = countRaw(text);
    const palette = countPalette(text);
    if (raw) out.raw[rel] = raw;
    if (palette) out.palette[rel] = palette;
  }
  return out;
}

function baselineDrift(actual: Baseline, allowed: Baseline): Drift[] {
  const out: Drift[] = [];
  for (const kind of ['raw', 'palette'] as const) {
    const files = [...new Set([...Object.keys(actual[kind]), ...Object.keys(allowed[kind])])].sort();
    for (const file of files) {
      const count = actual[kind][file] ?? 0;
      const max = allowed[kind][file] ?? 0;
      if (count !== max) out.push({ kind, file, count, allowed: max });
    }
  }
  return out;
}

function formatDrift(drift: Drift[]): string {
  return drift
    .map((d) => `${d.kind} ${d.file}: ${d.count} (baseline ${d.allowed})${d.count > d.allowed ? ' — new raw color' : ' — baseline stale, tighten it'}`)
    .join('\n');
}

function sorted(c: Counts): Counts {
  return Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));
}

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
}

function writeBaseline(b: Baseline): void {
  writeFileSync(BASELINE, `${JSON.stringify({ raw: sorted(b.raw), palette: sorted(b.palette) }, null, 2)}\n`);
}

describe('raw-color guard', () => {
  it('new token families are readable', () => {
    const t = rootTokens();
    expect(contrast(t['--warning-strong'], t['--warning-soft'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--note-fg'], t['--note-soft'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--warning'], t['--warning-soft'])).toBeGreaterThanOrEqual(4.5);
    expect(t['--warning-soft']).not.toBe(t['--note-soft']);
    expect(t['--rating']).toBeDefined();
  });

  it('strict files have no raw colors', () => {
    expect(STRICT.map((p) => [p, countRaw(readSrc(p))]).filter(([, n]) => n)).toEqual([]);
  });

  it('raw colors and palette classes match the baseline exactly', () => {
    if (process.env.UPDATE_RAW_COLOR_BASELINE) return writeBaseline(scan());
    const drift = baselineDrift(scan(), readBaseline());
    expect(
      drift,
      `${formatDrift(drift)}\nMore than allowed: remove the colors. Fewer (or file deleted): the baseline is stale. Either way, if intended run: ${REGEN}`,
    ).toEqual([]);
  });

  it('a file not in the baseline is held to zero', () => {
    expect(baselineDrift({ raw: { 'components/new.module.css': 1 }, palette: {} }, { raw: {}, palette: {} })).toEqual([
      { kind: 'raw', file: 'components/new.module.css', count: 1, allowed: 0 },
    ]);
  });

  it('a drop below the baseline is reported as stale', () => {
    expect(baselineDrift({ raw: {}, palette: {} }, { raw: { 'components/gone.tsx': 3 }, palette: {} })).toEqual([
      { kind: 'raw', file: 'components/gone.tsx', count: 0, allowed: 3 },
    ]);
  });

  it('drift message names file, count, allowance', () => {
    const msg = formatDrift([{ kind: 'raw', file: 'components/x.css', count: 2, allowed: 1 }]);
    expect(msg).toContain('components/x.css: 2 (baseline 1)');
    expect(msg).toContain('new raw color');
  });

  it('counters skip hex-ok lines and match palette classes', () => {
    expect(countRaw("a: '#fff'; // hex-ok: brand\nb: #1d1d1f; c: rgba(0,0,0,.1)")).toBe(2);
    expect(countPalette('text-zinc-500 dark:bg-red-50/40 hover:text-red-600 text-muted')).toBe(3);
  });
});
