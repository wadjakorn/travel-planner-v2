import { describe, expect, it } from 'vitest';
import { themeFromAttr } from './use-theme';

describe('themeFromAttr', () => {
  it('returns dark only for "dark"', () => {
    expect(themeFromAttr('dark')).toBe('dark');
  });
  it('falls back to light', () => {
    expect(themeFromAttr('light')).toBe('light');
    expect(themeFromAttr(null)).toBe('light');
    expect(themeFromAttr('system')).toBe('light');
  });
});
