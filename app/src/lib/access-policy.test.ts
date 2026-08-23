import { describe, it, expect } from 'vitest';
import { normalizeEmail, parseAllowlist, isAllowlisted } from './access-policy';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  A@X.COM ')).toBe('a@x.com');
  });

  it('maps null/undefined to empty string', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('parseAllowlist', () => {
  it('returns an empty list for unset or empty env', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
  });

  it('splits, trims and lowercases entries', () => {
    expect(parseAllowlist('A@x.com, b@Y.com')).toEqual(['a@x.com', 'b@y.com']);
  });

  it('drops entries that are not addresses', () => {
    expect(parseAllowlist('a@x.com,,   ,nonsense')).toEqual(['a@x.com']);
  });
});

describe('isAllowlisted', () => {
  const list = parseAllowlist('a@x.com,b@y.com');

  it('matches case-insensitively', () => {
    expect(isAllowlisted('A@X.com', list)).toBe(true);
  });

  it('rejects unknown addresses', () => {
    expect(isAllowlisted('c@z.com', list)).toBe(false);
  });

  it('never lets an empty address through, even against an empty list', () => {
    expect(isAllowlisted('', list)).toBe(false);
    expect(isAllowlisted('', [])).toBe(false);
  });
});
