import { createElement as h } from 'react';
import { renderToStaticMarkup as html } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Pin } from '@/lib/map-helpers';
import { GhostDot } from './map-ghost-dot';
import { MapPin } from './map-pin';

const pin: Pin = { id: 'h', idx: 1, kind: 'hotel', lat: 0, lng: 0, name: 'Hotel Gracery' };

describe('MapPin label', () => {
  it('renders pin.idx with no label', () => {
    const out = html(h(MapPin, { pin }));
    expect(out).toContain('>1</span>');
    expect(out).not.toContain('data-wide');
  });
  it('a merged label replaces the number and widens the shape', () => {
    const out = html(h(MapPin, { pin, label: '1 · 4' }));
    expect(out).toContain('1 · 4');
    expect(out).toContain('data-wide');
  });
  it('a short label keeps the default shape', () => {
    expect(html(h(MapPin, { pin, label: '12' }))).not.toContain('data-wide');
  });
  it('interactive takes an accessible-name override', () => {
    const out = html(h(MapPin, { pin, interactive: true, name: 'Stop 1: A; Stop 4: A' }));
    expect(out).toContain('aria-label="Stop 1: A; Stop 4: A"');
  });
});

describe('GhostDot', () => {
  it('interactive (MapLibre) is a named button', () => {
    const out = html(h(GhostDot, { title: 'Day 2: Senso-ji', interactive: true }));
    expect(out).toMatch(/^<button type="button"[^>]*aria-label="Day 2: Senso-ji"/);
  });
  it('otherwise aria-hidden (Google names the marker)', () => {
    const out = html(h(GhostDot, { title: 'Day 2: Senso-ji' }));
    expect(out).toMatch(/^<div aria-hidden="true"/);
    expect(out).not.toContain('Senso-ji');
  });
});
