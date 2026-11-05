import { describe, it, expect } from 'vitest';
import { colorFor, initialsOf } from './avatar';

describe('avatar (TP-0115)', () => {
  it('initials from name, else email, else ?', () => {
    expect(initialsOf('Wadjakorn Tonsri', 'x@y')).toBe('WT');
    expect(initialsOf(null, 'mai@example.com')).toBe('MA');
    expect(initialsOf(null, null)).toBe('?');
  });
  it('colour is stable per id', () => {
    expect(colorFor('u1')).toBe(colorFor('u1'));
    expect(colorFor('u1')).toMatch(/^hsl\(\d+, 55%, 55%\)$/);
  });
});
