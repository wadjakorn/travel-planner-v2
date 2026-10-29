import { describe, it, expect } from 'vitest';
import { formatShare, sharePct } from './budget-share';

describe('formatShare', () => {
  it('reads a true zero as 0%', () => {
    expect(formatShare(0, 8875)).toBe('0%');
  });

  it('never rounds a real share down to 0% or up to 100%', () => {
    expect(formatShare(22, 8875)).toBe('<1%');
    expect(formatShare(8850, 8875)).toBe('>99%');
  });

  it('rounds everything else', () => {
    expect(formatShare(95, 8875)).toBe('1%');
    expect(formatShare(8875, 8875)).toBe('100%');
  });

  it('does not clamp above 100%', () => {
    expect(formatShare(11000, 8875)).toBe('124%');
  });

  it('is 0% with nothing to measure against', () => {
    expect(formatShare(5, 0)).toBe('0%');
  });
});

describe('sharePct', () => {
  it('is unrounded and 0 for a non-positive whole', () => {
    expect(sharePct(22, 8875)).toBeCloseTo(0.2479, 3);
    expect(sharePct(5, 0)).toBe(0);
    expect(sharePct(5, -1)).toBe(0);
  });
});
