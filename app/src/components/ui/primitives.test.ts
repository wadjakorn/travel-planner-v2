import { createElement as h } from 'react';
import { renderToStaticMarkup as html } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { srcFiles } from '../../../test/src-files';
import * as card from './card';
import { Input, Select, Textarea, inputClasses } from './input';

describe('Input', () => {
  it('invalid marks the field and keeps the description link', () => {
    const out = html(h(Input, { invalid: true, 'aria-describedby': 'd1' }));
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-describedby="d1"');
  });
  it('valid fields carry no aria-invalid', () => {
    // The attribute, not the `aria-invalid:` class variant every field carries.
    expect(html(h(Input, {}))).not.toContain('aria-invalid=');
    expect(html(h(Input, { invalid: false }))).not.toContain('aria-invalid=');
  });
  it('an explicit aria-invalid wins when invalid is not set', () => {
    expect(html(h(Input, { 'aria-invalid': true }))).toContain('aria-invalid="true"');
  });
  it('Textarea and Select accept invalid', () => {
    expect(html(h(Textarea, { invalid: true }))).toContain('aria-invalid="true"');
    expect(html(h(Select, { invalid: true }))).toContain('aria-invalid="true"');
  });
  it('sizes', () => {
    expect(inputClasses()).toContain('h-10');
    expect(inputClasses({ size: 'lg' })).toContain('h-11');
    expect(inputClasses({ size: 'lg' })).not.toContain('h-10');
    expect(html(h(Input, { size: 'lg' }))).toContain('h-11');
    expect(html(h(Select, { size: 'lg' }))).toContain('h-11');
  });
  it('invalid styling keys off the attribute', () => {
    expect(inputClasses()).toContain('aria-invalid:border-danger');
  });
});

describe('pending buttons', () => {
  it('nobody passes pendingText any more', () => {
    expect(srcFiles(['.tsx']).filter((f) => /pendingText/.test(f.text)).map((f) => f.rel)).toEqual([]);
  });
  it('no hand-written pending labels on raw buttons', () => {
    const re = /\?\s*['"](Saving|Adding|Updating|Creating|Sending)…?\.{0,3}['"]/;
    expect(srcFiles(['.tsx']).filter((f) => re.test(f.text)).map((f) => f.rel)).toEqual([]);
  });
});

describe('Card', () => {
  it('is the only card export and carries the surface classes', () => {
    expect(Object.keys(card)).toEqual(['Card']);
    const out = html(h(card.Card, { className: 'p-8' }));
    expect(out).toContain('rounded-2xl');
    expect(out).toContain('border-border');
    expect(out).toContain('p-8');
  });
});
