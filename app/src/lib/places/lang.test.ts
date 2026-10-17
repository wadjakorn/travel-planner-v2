import { describe, expect, it } from 'vitest';
import { queryLang } from './lang';

describe('queryLang', () => {
  it('th when any Thai character is present', () => {
    expect(queryLang('ตลาดน้ำอัมพวา')).toBe('th');
    expect(queryLang('ร้าน Ristr8to')).toBe('th');
  });
  it('en otherwise', () => {
    expect(queryLang('Senso-ji')).toBe('en');
    expect(queryLang('浅草寺')).toBe('en');
  });
});
