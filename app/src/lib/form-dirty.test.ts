import { describe, it, expect } from 'vitest';
import { serializeEntries } from './form-dirty';

describe('serializeEntries', () => {
  it('is stable regardless of entry order', () => {
    const a = serializeEntries([['b', '2'], ['a', '1']]);
    const b = serializeEntries([['a', '1'], ['b', '2']]);
    expect(a).toBe(b);
  });

  it('distinguishes a changed value', () => {
    const before = serializeEntries([['name', 'Hilton']]);
    const after = serializeEntries([['name', 'Hilton Tokyo']]);
    expect(before).not.toBe(after);
  });

  it('keeps repeated keys distinct from a single joined value', () => {
    const repeated = serializeEntries([['tag', 'a'], ['tag', 'b']]);
    const joined = serializeEntries([['tag', 'a,b']]);
    expect(repeated).not.toBe(joined);
  });

  it('ignores File values, which cannot be compared by value', () => {
    const file = new File(['x'], 'x.pdf');
    const withFile = serializeEntries([['doc', file], ['name', 'A']]);
    const withoutFile = serializeEntries([['name', 'A']]);
    expect(withFile).toBe(withoutFile);
  });
});
