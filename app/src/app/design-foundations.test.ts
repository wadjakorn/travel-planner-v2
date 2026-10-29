// Design-system foundation guards (review DS-01): token contrast plus source
// scans that keep fixed values from drifting back. Helpers live in app/test/.
import { describe, expect, it } from 'vitest';
import { contrast, rootTokens } from '../../test/css-tokens';

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
