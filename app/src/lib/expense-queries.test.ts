import { describe, it, expect } from 'vitest';
import { buildBudgetSummary } from './expense-queries';
import type { BookingInput, ExpenseInput } from './expense-queries';

const expense = (o: Partial<ExpenseInput> = {}): ExpenseInput => ({
  id: 'e1',
  category: 'food',
  label: 'Dinner',
  amount: 100,
  currency: 'USD',
  at: new Date('2026-04-10T00:00:00Z'),
  ...o,
});

const booking = (o: Partial<BookingInput> = {}): BookingInput => ({
  id: 'b1',
  label: 'Hotel Okura',
  costAmount: 500,
  costCurrency: null,
  date: '2026-04-12',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...o,
});

const build = (o: {
  tripCurrency?: string;
  expenses?: ExpenseInput[];
  hotels?: BookingInput[];
  transport?: BookingInput[];
}) =>
  buildBudgetSummary({
    tripId: 't1',
    tripCurrency: o.tripCurrency ?? 'USD',
    expenses: o.expenses ?? [],
    hotels: o.hotels ?? [],
    transport: o.transport ?? [],
  });

const cat = (s: ReturnType<typeof build>, c: string) =>
  s.byCategory.find((x) => x.category === c)!;

describe('buildBudgetSummary', () => {
  it('counts booking costs toward the total and their category', () => {
    const s = build({
      hotels: [booking({ costAmount: 500 })],
      transport: [booking({ id: 'b2', label: 'NRT flight', costAmount: 300 })],
    });
    expect(s.totalSpent).toBe(800);
    expect(cat(s, 'hotels').amount).toBe(500);
    expect(cat(s, 'transport').amount).toBe(300);
  });

  it('counts bookings whose currency is null as trip currency', () => {
    // Every transport booking created before this change carries null —
    // requiring an exact match would zero out all of them.
    const s = build({
      tripCurrency: 'THB',
      transport: [booking({ costCurrency: null, costAmount: 1200 })],
    });
    expect(s.totalSpent).toBe(1200);
    expect(s.excluded.count).toBe(0);
  });

  it('excludes rows in another currency instead of summing them', () => {
    const s = build({
      tripCurrency: 'THB',
      expenses: [
        expense({ id: 'e1', currency: 'THB', amount: 900 }),
        expense({ id: 'e2', currency: 'USD', amount: 50 }),
      ],
      hotels: [booking({ costCurrency: 'JPY', costAmount: 40000 })],
    });
    expect(s.totalSpent).toBe(900);
    expect(s.excluded).toEqual({ count: 2, currencies: ['JPY', 'USD'] });
  });

  it('matches currency case-insensitively', () => {
    const s = build({ expenses: [expense({ currency: 'usd', amount: 70 })] });
    expect(s.totalSpent).toBe(70);
    expect(s.excluded.count).toBe(0);
  });

  it('skips bookings with no cost entered', () => {
    const s = build({ hotels: [booking({ costAmount: null })] });
    expect(s.totalSpent).toBe(0);
    expect(cat(s, 'hotels').count).toBe(0);
  });

  it('counts every source in the per-category count', () => {
    // The "N items" label sits directly under the amount; if the count
    // ignored bookings the two would describe different sets of rows.
    const s = build({
      expenses: [expense({ category: 'hotels', amount: 20 })],
      hotels: [booking({ costAmount: 500 })],
    });
    expect(cat(s, 'hotels').count).toBe(2);
    expect(cat(s, 'hotels').amount).toBe(520);
  });

  it('reports both sources separately so double counting is visible', () => {
    const s = build({
      expenses: [expense({ category: 'hotels', amount: 20 })],
      hotels: [booking({ costAmount: 500 })],
    });
    expect(cat(s, 'hotels').fromBooking).toBe(500);
    expect(cat(s, 'hotels').fromExpense).toBe(20);
  });

  it('lists bookings alongside expenses so the list reconciles with the total', () => {
    const s = build({
      expenses: [expense({ amount: 100 })],
      hotels: [booking({ costAmount: 500 })],
    });
    expect(s.recent.map((r) => r.source)).toEqual(['hotel', 'expense']); // newest first
    expect(s.recent.reduce((t, r) => t + r.amount, 0)).toBe(s.totalSpent);
  });

  it('links expense rows to their edit page and booking rows to bookings', () => {
    const s = build({
      expenses: [expense({ id: 'x9' })],
      hotels: [booking()],
    });
    expect(s.recent.find((r) => r.source === 'expense')!.href).toBe(
      '/trip/t1/expense/x9/edit',
    );
    expect(s.recent.find((r) => r.source === 'hotel')!.href).toBe('/trip/t1/bookings');
  });

  it('dates bookings from the booking date, in UTC', () => {
    const s = build({ hotels: [booking({ date: '2026-04-12' })] });
    expect(s.recent[0].at.toISOString()).toBe('2026-04-12T00:00:00.000Z');
  });

  it('falls back to createdAt when the booking date is unusable', () => {
    const created = new Date('2026-02-02T09:00:00Z');
    const s = build({ hotels: [booking({ date: 'sometime in April', createdAt: created })] });
    expect(s.recent[0].at).toEqual(created);
  });

  it('caps the recent list at 10 newest rows', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      expense({ id: `e${i}`, at: new Date(Date.UTC(2026, 3, i + 1)) }),
    );
    const s = build({ expenses: many });
    expect(s.recent).toHaveLength(10);
    expect(s.recent[0].id).toBe('e13');
    // the total still counts every row, not just the ten shown
    expect(s.totalSpent).toBe(1400);
  });

  it('always returns every category, zeroed', () => {
    const s = build({});
    expect(s.byCategory.map((c) => c.category)).toEqual([
      'transport', 'hotels', 'food', 'activities', 'shopping', 'other',
    ]);
    expect(s.totalSpent).toBe(0);
  });
});
