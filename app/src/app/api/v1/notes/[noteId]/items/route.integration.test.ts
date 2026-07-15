// Integration test for POST /api/v1/notes/:noteId/items atomic idempotency.
// Gated on TEST_DATABASE_URL. Drives withIdempotencyAtomic with an injected
// client and a run(tx) mirroring the route body (real threaded addChecklistItem,
// which resolves the note + authorizes + writes on the tx).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, notes, checklistItems } from '@/db/schema';
import { addChecklistItem } from '@/lib/services/note-service';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import type { IdemExecutor } from '@/lib/api/idempotency';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'items-u1';

function reqWithKey(key: string, noteId: string): Request {
  const headers = new Headers();
  headers.set('idempotency-key', key);
  return new Request(`http://t.local/api/v1/notes/${noteId}/items`, { method: 'POST', headers });
}

suite('POST /api/v1/notes/:noteId/items (atomic idempotency)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let noteId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('items-u1','I','items@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `items-trip-${Date.now()}` })
      .returning({ id: trips.id });
    const [n] = await database
      .insert(notes)
      .values({ tripId: t.id, idx: 0, kind: 'checklist', title: 'Checklist' })
      .returning({ id: notes.id });
    noteId = n.id;
  });

  afterAll(async () => {
    await client?.end();
  });

  const deps = () => ({
    idemDb: database as unknown as IdemExecutor,
    txDb: database as unknown as typeof import('@/db').dbNode,
  });

  const body = { text: 'Passport' };
  const run = async (tx: IdemExecutor) => {
    const item = await addChecklistItem(USER, noteId, body, tx);
    return { status: 201, body: { item } };
  };

  it('creates one checklist item and replays the retry without duplicating', async () => {
    const key = `items-${Date.now()}`;
    const r1 = await withIdempotencyAtomic(USER, reqWithKey(key, noteId), body, run, deps());
    const b1 = await r1.json();
    expect(r1.status).toBe(201);
    const r2 = await withIdempotencyAtomic(USER, reqWithKey(key, noteId), body, run, deps());
    const b2 = await r2.json();
    expect(b2).toEqual(b1); // replay
    const rows = await database
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.noteId, noteId));
    expect(rows).toHaveLength(1); // no duplicate
  });
});
