// Integration test for POST /api/v1/trips/:tripId/expenses atomic idempotency.
// Gated on TEST_DATABASE_URL. Drives withIdempotencyAtomic with an injected
// client and a run(tx) mirroring the route body (real threaded createExpense +
// coupled replaceSplits write). Splits use the test user's id (FK -> user).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, expenses, expenseSplits } from '@/db/schema';
import { createExpense } from '@/lib/services/expense-service';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import type { IdemExecutor } from '@/lib/api/idempotency';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'expenses-u1';

function reqWithKey(key: string, tripId: string): Request {
  const headers = new Headers();
  headers.set('idempotency-key', key);
  return new Request(`http://t.local/api/v1/trips/${tripId}/expenses`, { method: 'POST', headers });
}

suite('POST /api/v1/trips/:tripId/expenses (atomic idempotency)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let tripId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('expenses-u1','E','expenses@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `expenses-trip-${Date.now()}` })
      .returning({ id: trips.id });
    tripId = t.id;
  });

  afterAll(async () => {
    await client?.end();
  });

  const deps = () => ({
    idemDb: database as unknown as IdemExecutor,
    txDb: database as unknown as typeof import('@/db').dbNode,
  });

  const body = { category: 'food', amount: 12.5, splits: [{ accountId: USER }] };
  const run = async (tx: IdemExecutor) => {
    const expense = await createExpense(USER, tripId, body, tx);
    return { status: 201, body: { expense } };
  };

  it('creates one expense (+ split) and replays the retry without duplicating', async () => {
    const key = `expenses-${Date.now()}`;
    const r1 = await withIdempotencyAtomic(USER, reqWithKey(key, tripId), body, run, deps());
    const b1 = await r1.json();
    expect(r1.status).toBe(201);
    const r2 = await withIdempotencyAtomic(USER, reqWithKey(key, tripId), body, run, deps());
    const b2 = await r2.json();
    expect(b2).toEqual(b1); // replay
    const rows = await database.select().from(expenses).where(eq(expenses.tripId, tripId));
    expect(rows).toHaveLength(1); // no duplicate
    // replaceSplits committed inside the same tx -> exactly one split row.
    const splitRows = await database
      .select()
      .from(expenseSplits)
      .where(eq(expenseSplits.expenseId, rows[0].id));
    expect(splitRows).toHaveLength(1);
  });
});
