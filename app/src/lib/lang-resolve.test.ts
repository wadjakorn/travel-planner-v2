import { describe, expect, it } from 'vitest';
import { resolveLangFrom } from './lang-resolve';

describe('resolveLangFrom (i18n Decision 3: cookie → Accept-Language → en)', () => {
  it('a valid lang cookie wins over the browser', () => {
    expect(resolveLangFrom({ cookie: 'th', acceptLanguage: 'en' })).toBe('th');
    expect(resolveLangFrom({ cookie: 'en', acceptLanguage: 'th-TH,th;q=0.9' })).toBe('en');
  });

  it('ignores an unknown cookie and falls back to Accept-Language', () => {
    expect(resolveLangFrom({ cookie: 'xx', acceptLanguage: 'th-TH,th;q=0.9' })).toBe('th');
    expect(resolveLangFrom({ cookie: '', acceptLanguage: 'th' })).toBe('th');
  });

  it('defaults to English with neither', () => {
    expect(resolveLangFrom({ cookie: undefined, acceptLanguage: null })).toBe('en');
    expect(resolveLangFrom({ cookie: undefined, acceptLanguage: 'ja-JP' })).toBe('en');
  });
});
