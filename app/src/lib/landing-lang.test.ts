import { describe, it, expect } from 'vitest';
import { langFromAcceptLanguage } from './landing-lang';

describe('langFromAcceptLanguage', () => {
  it('picks Thai when it is the preferred language', () => {
    expect(langFromAcceptLanguage('th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7')).toBe('th');
    expect(langFromAcceptLanguage('th')).toBe('th');
  });

  it('picks English when English outranks Thai', () => {
    expect(langFromAcceptLanguage('en-US,en;q=0.9,th;q=0.8')).toBe('en');
    expect(langFromAcceptLanguage('th;q=0.5, en;q=0.8')).toBe('en');
  });

  it('honours q-values over list order', () => {
    expect(langFromAcceptLanguage('en;q=0.4, th;q=0.9')).toBe('th');
  });

  it('falls back to English for missing, unsupported or junk headers', () => {
    expect(langFromAcceptLanguage(null)).toBe('en');
    expect(langFromAcceptLanguage('')).toBe('en');
    expect(langFromAcceptLanguage('ja-JP,ja;q=0.9')).toBe('en');
    expect(langFromAcceptLanguage('th;q=0')).toBe('en');
    expect(langFromAcceptLanguage(';;,q=,*')).toBe('en');
  });

  it('lets a Thai visitor with an unsupported first choice still get Thai', () => {
    expect(langFromAcceptLanguage('ja,th;q=0.8,en;q=0.5')).toBe('th');
  });
});
