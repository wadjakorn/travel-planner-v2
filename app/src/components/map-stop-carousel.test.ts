import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// TP-0119 (docs/superpowers/plans/2026-10-30-mobile-map-overflow-fix.md): the
// stop strip must be the containing block of its absolutely positioned
// children (each card's sr-only "Stop n:"), or they escape its overflow clip,
// widen the page, and push the phone's fixed nav/pill off-screen. The layout
// itself is covered by e2e/mobile-layout.spec.ts (not in CI); this pins the
// source so a refactor can't silently drop it.
const src = readFileSync(fileURLToPath(new URL('./map-stop-carousel.tsx', import.meta.url)), 'utf8');

function stripClassName(): string {
  const ul = src.match(/<ul\b[^>]*?ref=\{stripRef\}[\s\S]*?>/);
  if (!ul) throw new Error('stop strip <ul ref={stripRef}> not found');
  const cls = ul[0].match(/className="([^"]*)"/);
  if (!cls) throw new Error('stop strip has no static className');
  return cls[1];
}

describe('map stop carousel strip', () => {
  it('is a positioned horizontal scroll container', () => {
    const classes = stripClassName().split(/\s+/);
    expect(classes).toContain('relative');
    expect(classes).toContain('overflow-x-auto');
  });
});
