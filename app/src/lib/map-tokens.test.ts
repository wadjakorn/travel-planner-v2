import { describe, expect, it } from 'vitest';
import { contrast, rootTokens } from '../../test/css-tokens';
import { KIND_COLOR, MODE_COLOR, ROUTE_CASING_COLOR, ROUTE_NONE_COLOR } from './map-helpers';

const root = rootTokens(':root');
const dark = rootTokens('[data-theme="dark"]');

describe('map tokens', () => {
  it('pin colors keep white digits at >= 4.5:1', () => {
    expect(root['--map-pin-fg']).toBe('#ffffff');
    for (const k of ['sight', 'food', 'stay', 'other']) {
      expect(contrast(root[`--map-pin-${k}`], '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('popup text stays readable on the light card', () => {
    for (const k of ['fg', 'muted', 'link']) {
      expect(contrast(root[`--map-card-${k}`], root['--map-card-bg'])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('route mirror matches the CSS tokens', () => {
    for (const m of ['walk', 'drive', 'transit'] as const) {
      expect(MODE_COLOR[m]).toBe(root[`--map-route-${m}`]);
    }
    expect(ROUTE_NONE_COLOR).toMatch(/^#[0-9a-f]{6}$/);
    expect(ROUTE_NONE_COLOR).toBe(root['--map-route-none']);
    expect(ROUTE_CASING_COLOR).toMatch(/^#[0-9a-f]{6}$/);
    expect(ROUTE_CASING_COLOR).toBe(root['--map-route-casing']);
  });

  it('KIND_COLOR points at defined pin tokens', () => {
    expect(KIND_COLOR).toEqual({
      hotel: 'var(--map-pin-stay)',
      food: 'var(--map-pin-food)',
      sight: 'var(--map-pin-sight)',
      transit: 'var(--map-pin-other)',
    });
    for (const v of Object.values(KIND_COLOR)) expect(root[v.slice(4, -1)]).toBeDefined();
  });

  it('map tokens are light-locked (not overridden in dark)', () => {
    expect(Object.keys(dark).filter((n) => n.startsWith('--map-'))).toEqual([]);
    expect(root['--map-card-fg']).toBe('#18181b');
    expect(root['--map-pin-ghost']).toBe('rgb(148 163 184 / 0.6)');
  });
});
