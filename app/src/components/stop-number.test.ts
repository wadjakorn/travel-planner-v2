import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Segmented } from '@/components/ui/segmented';
import { KIND_COLOR } from '@/lib/map-helpers';
import { StopNumber } from './stop-number';

describe('StopNumber', () => {
  it('uses the colour of the map pin for its kind', () => {
    for (const kind of ['hotel', 'food', 'sight', 'transit'] as const) {
      const html = renderToStaticMarkup(createElement(StopNumber, { kind, n: 3 }));
      expect(html).toContain(`--pin-color:${KIND_COLOR[kind]}`);
      expect(html).toContain('>3</span>');
    }
  });

  it('stays readable by default and hides only when asked', () => {
    expect(renderToStaticMarkup(createElement(StopNumber, { kind: 'food', n: 1 }))).not.toContain('aria-hidden');
    expect(renderToStaticMarkup(createElement(StopNumber, { kind: 'food', n: 1, 'aria-hidden': true }))).toContain(
      'aria-hidden="true"',
    );
  });
});

describe('Segmented activeClassName', () => {
  const props = { value: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], onChange: () => {}, ariaLabel: 'x' };

  it('replaces the brand fill on the pressed option only', () => {
    const html = renderToStaticMarkup(createElement(Segmented<string>, { ...props, activeClassName: 'custom-on' }));
    expect(html).toContain('custom-on');
    expect(html).not.toContain('bg-brand');
    expect(html.match(/custom-on/g)).toHaveLength(1);
  });

  it('keeps the brand fill by default', () => {
    expect(renderToStaticMarkup(createElement(Segmented<string>, props))).toContain('bg-brand text-brand-foreground');
  });
});
