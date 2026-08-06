import { describe, it, expect } from 'vitest';
import { toEditableExpense } from './editable-expense';

describe('toEditableExpense', () => {
  it('renders the date as a YYYY-MM-DD string the form input accepts', () => {
    const row = {
      id: 'e1',
      category: 'food' as const,
      label: 'Ramen',
      amount: 980,
      dayIdx: 2,
      note: null,
      at: new Date('2026-04-12T15:30:00.000Z'),
    };
    expect(toEditableExpense(row).at).toBe('2026-04-12');
  });

  it('keeps a null dayIdx null rather than coercing it to 0', () => {
    const row = {
      id: 'e2',
      category: 'other' as const,
      label: null,
      amount: 10,
      dayIdx: null,
      note: null,
      at: new Date('2026-04-12T00:00:00.000Z'),
    };
    // 0 is a real day ("Day 1"); collapsing null into it would silently
    // re-tag an untagged expense on save.
    expect(toEditableExpense(row).dayIdx).toBeNull();
  });
});
