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

describe('buildBudgetSummary — currency not chosen yet', () => {
  it('counts a THB booking on a trip with no budget settings', () => {
    // Regression: trips.currency used to default to 'USD', so a ฿2,500 hotel
    // was excluded and the page read $0 with the money one screen away.
    const s = buildBudgetSummary({
      tripId: 't1',
      tripCurrency: null,
      expenses: [],
      hotels: [booking({ costCurrency: 'THB', costAmount: 2500 })],
      transport: [],
    });
    expect(s.currency).toBe('THB');
    expect(s.totalSpent).toBe(2500);
    expect(s.excluded.count).toBe(0);
  });

  it('still excludes the minority currency once one is inferred', () => {
    const s = buildBudgetSummary({
      tripId: 't1',
      tripCurrency: null,
      expenses: [
        expense({ id: 'a', currency: 'THB', amount: 100 }),
        expense({ id: 'b', currency: 'THB', amount: 200 }),
        expense({ id: 'c', currency: 'JPY', amount: 900 }),
      ],
      hotels: [],
      transport: [],
    });
    expect(s.currency).toBe('THB');
    expect(s.totalSpent).toBe(300);
    expect(s.excluded).toEqual({ count: 1, currencies: ['JPY'] });
  });
});

describe('buildBudgetSummary — bookings with no cost', () => {
  it('counts them instead of skipping them silently', () => {
    // They cannot be added to the total (there is no number), but they are the
    // usual reason it is lower than the trip really costs.
    const s = build({
      hotels: [
        booking({ id: 'h1', costAmount: 2500 }),
        booking({ id: 'h2', costAmount: null }),
        booking({ id: 'h3', costAmount: null }),
      ],
      transport: [booking({ id: 't1', costAmount: null })],
    });
    expect(s.totalSpent).toBe(2500);
    expect(s.missingCost).toEqual({ hotels: 2, transport: 1 });
    // and they stay out of the list, which must still add up to the total
    expect(s.recent).toHaveLength(1);
  });

  it('is zero when every booking is priced', () => {
    const s = build({ hotels: [booking({ costAmount: 100 })] });
    expect(s.missingCost).toEqual({ hotels: 0, transport: 0 });
  });
});

// Shaped like the demo seed (lib/seed-trip.ts): bookings $7,144, logged
// expenses $1,731, three of which duplicate a booking payment.
const seedLike = () => ({
  hotels: [
    booking({ id: 'park-1', label: 'Park Hotel Tokyo', costAmount: 380, date: '2026-04-12' }),
    booking({ id: 'hoshinoya', label: 'Hoshinoya Fuji', costAmount: 720, date: '2026-04-13' }),
    booking({ id: 'tenseien', label: 'Hakone Yumoto Onsen Tenseien', costAmount: 540, date: '2026-04-14' }),
    booking({ id: 'park-2', label: 'Park Hotel Tokyo', costAmount: 380, date: '2026-04-15' }),
  ],
  transport: [
    booking({ id: 'jl5', label: 'JL5', costAmount: 2480, date: '2026-04-11' }),
    booking({ id: 'shinkansen', label: 'Shinkansen', costAmount: 76, date: '2026-04-14' }),
    booking({ id: 'car', label: 'Toyota Prius · 3-day rental', costAmount: 88, date: '2026-04-13' }),
    booking({ id: 'jl62', label: 'JL62', costAmount: 2480, date: '2026-04-16' }),
  ],
  expenses: [
    expense({ id: 'park-night-1', category: 'hotels', label: 'Park Hotel · Night 1', amount: 380, at: new Date('2026-04-12') }),
    expense({ id: 'sushi', category: 'food', label: 'Sushi Saito dinner', amount: 240, at: new Date('2026-04-12') }),
    expense({ id: 'taxi', category: 'transport', label: 'Taxi Shibuya', amount: 28, at: new Date('2026-04-12') }),
    expense({ id: 'car-rental', category: 'transport', label: 'Car rental · Times', amount: 88, at: new Date('2026-04-13') }),
    expense({ id: 'hoto', category: 'food', label: 'Hoto Fudo lunch', amount: 32, at: new Date('2026-04-13') }),
    expense({ id: 'cruise', category: 'activities', label: 'Lake Kawaguchi cruise', amount: 14, at: new Date('2026-04-13') }),
    expense({ id: 'tenseien-night-1', category: 'hotels', label: 'Hakone Tenseien · Night 1', amount: 540, at: new Date('2026-04-14') }),
    expense({ id: 'wagyu', category: 'food', label: 'Itoh Dining wagyu', amount: 268, at: new Date('2026-04-14') }),
    expense({ id: 'souvenirs', category: 'shopping', label: 'Komachi Dori souvenirs', amount: 95, at: new Date('2026-04-15') }),
    expense({ id: 'hasedera', category: 'activities', label: 'Hasedera entry', amount: 8, at: new Date('2026-04-15') }),
    expense({ id: 'tsukiji', category: 'food', label: 'Tsukiji breakfast', amount: 38, at: new Date('2026-04-16') }),
  ],
});

describe('buildBudgetSummary — bookings/other split', () => {
  it('fromBookings + fromExpenses === totalSpent, and fromBookings is the Bookings total', () => {
    const s = build(seedLike());
    expect(s.fromBookings).toBe(7144);
    expect(s.fromExpenses).toBe(1731);
    expect(s.fromBookings + s.fromExpenses).toBe(s.totalSpent);
  });

  it('leaves other-currency rows out of both subtotals', () => {
    const s = build({
      expenses: [expense({ amount: 10 }), expense({ id: 'e2', currency: 'JPY', amount: 999 })],
      hotels: [booking({ costAmount: 50 }), booking({ id: 'b2', costCurrency: 'JPY', costAmount: 9999 })],
    });
    expect(s.fromBookings).toBe(50);
    expect(s.fromExpenses).toBe(10);
  });
});

describe('buildBudgetSummary — merge suggestions', () => {
  const pairs = (s: ReturnType<typeof build>) =>
    s.suggestions.map((x) => ({ expenseId: x.expenseId, bookingId: x.bookingId }));

  it('suggestion prefers the booking on the expense date', () => {
    const s = build(seedLike());
    expect(pairs(s)).toEqual([
      { expenseId: 'park-night-1', bookingId: 'park-1' },
      { expenseId: 'car-rental', bookingId: 'car' },
      { expenseId: 'tenseien-night-1', bookingId: 'tenseien' },
    ]);
    expect(s.suggestions.some((x) => x.expenseId === 'taxi')).toBe(false);
    expect(s.suggestions[0]).toEqual({
      expenseId: 'park-night-1',
      expenseLabel: 'Park Hotel · Night 1',
      amount: 380,
      category: 'hotels',
      bookingId: 'park-1',
      bookingLabel: 'Park Hotel Tokyo',
    });
  });

  it('falls back to the earliest booking date, then id, when no date matches', () => {
    const s = build({
      hotels: [
        booking({ id: 'h-late', costAmount: 100, date: '2026-04-20' }),
        booking({ id: 'h-b', costAmount: 100, date: '2026-04-15' }),
        booking({ id: 'h-a', costAmount: 100, date: '2026-04-15' }),
      ],
      expenses: [expense({ id: 'x', category: 'hotels', amount: 100, at: new Date('2026-04-01') })],
    });
    expect(pairs(s)).toEqual([{ expenseId: 'x', bookingId: 'h-a' }]);
  });

  it('a booking absorbs at most one expense', () => {
    const s = build({
      hotels: [booking({ id: 'tenseien', costAmount: 540, date: '2026-04-14' })],
      expenses: [
        expense({ id: 'later', category: 'hotels', amount: 540, at: new Date('2026-04-15') }),
        expense({ id: 'earlier', category: 'hotels', amount: 540, at: new Date('2026-04-14') }),
      ],
    });
    expect(pairs(s)).toEqual([{ expenseId: 'earlier', bookingId: 'tenseien' }]);
  });

  it('pairs two equal expenses with two equal bookings one to one', () => {
    const s = build({
      hotels: [
        booking({ id: 'park-1', costAmount: 380, date: '2026-04-12' }),
        booking({ id: 'park-2', costAmount: 380, date: '2026-04-15' }),
      ],
      expenses: [
        expense({ id: 'n2', category: 'hotels', amount: 380, at: new Date('2026-04-15') }),
        expense({ id: 'n1', category: 'hotels', amount: 380, at: new Date('2026-04-12') }),
      ],
    });
    expect(pairs(s)).toEqual([
      { expenseId: 'n1', bookingId: 'park-1' },
      { expenseId: 'n2', bookingId: 'park-2' },
    ]);
  });

  it('no suggestion across categories', () => {
    const s = build({
      hotels: [booking({ costAmount: 380 })],
      expenses: [expense({ category: 'food', amount: 380 })],
    });
    expect(s.suggestions).toEqual([]);
  });

  it('no suggestion for a transport expense against a hotel booking', () => {
    const s = build({
      hotels: [booking({ costAmount: 88 })],
      expenses: [expense({ category: 'transport', amount: 88 })],
    });
    expect(s.suggestions).toEqual([]);
  });

  it('no suggestion across currencies', () => {
    const s = build({
      tripCurrency: 'USD',
      hotels: [booking({ costAmount: 380, costCurrency: 'JPY' })],
      expenses: [expense({ category: 'hotels', amount: 380 })],
    });
    expect(s.suggestions).toEqual([]);
  });

  it('no suggestion for a booking without cost', () => {
    const s = build({
      hotels: [booking({ costAmount: null })],
      expenses: [expense({ category: 'hotels', amount: 0 })],
    });
    expect(s.suggestions).toEqual([]);
  });

  it('no suggestion when the amounts differ by a cent or more', () => {
    const s = build({
      hotels: [booking({ costAmount: 380 })],
      expenses: [expense({ category: 'hotels', amount: 380.01 })],
    });
    expect(s.suggestions).toEqual([]);
  });
});

describe('buildBudgetSummary — merge suggestion edge order', () => {
  it('prefers a dated booking over an undated one', () => {
    const s = build({
      hotels: [
        booking({ id: 'a-undated', costAmount: 100, date: null }),
        booking({ id: 'z-dated', costAmount: 100, date: '2026-04-20' }),
      ],
      expenses: [expense({ id: 'x', category: 'hotels', amount: 100, at: new Date('2026-04-01') })],
    });
    expect(s.suggestions.map((x) => x.bookingId)).toEqual(['z-dated']);
  });
});
