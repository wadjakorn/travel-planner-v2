import { describe, it, expect } from 'vitest';
import { maskEmail, normalizeEmail, parseAllowlist, isAllowlisted } from './access-policy';

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

describe('maskEmail', () => {
  it('masks the local part and the domain label, keeping the TLD', () => {
    expect(maskEmail('jane@gmail.com')).toBe('j\u2022\u2022\u2022@g\u2022\u2022\u2022.com');
  });

  it('masks a one-character local part without leaking it further', () => {
    expect(maskEmail('a@b.co')).toBe('a\u2022\u2022\u2022@b\u2022\u2022\u2022.co');
  });

  it('normalises before masking', () => {
    expect(maskEmail('  Jane@GMAIL.com ')).toBe('j\u2022\u2022\u2022@g\u2022\u2022\u2022.com');
  });

  it('handles a value with no @ rather than throwing', () => {
    expect(maskEmail('nonsense')).toBe('n\u2022\u2022\u2022');
  });

  it('returns an empty string for empty or null input', () => {
    expect(maskEmail('')).toBe('');
    expect(maskEmail(null)).toBe('');
    expect(maskEmail(undefined)).toBe('');
  });

  it('does not split a surrogate pair', () => {
    expect(maskEmail('\u{1F600}x@mail.com')).toBe('\u{1F600}\u2022\u2022\u2022@m\u2022\u2022\u2022.com');
  });

  it('handles a domain with no dot', () => {
    expect(maskEmail('a@localhost')).toBe('a\u2022\u2022\u2022@l\u2022\u2022\u2022');
  });
});
