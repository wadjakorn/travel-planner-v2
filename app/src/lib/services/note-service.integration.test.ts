// listNotes returns only this trip's checklist items (TP-0145 drive-by: it
// used to read the whole checklist_item table). Gated on TEST_DATABASE_URL.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, notes, checklistItems } from '@/db/schema';

vi.mock('server-only', () => ({}));
vi.mock('@/db', async () => {
  const pg = (await import('postgres')).default;
  const { drizzle: d } = await import('drizzle-orm/postgres-js');
  const s = await import('@/db/schema');
  const conn = d(pg(process.env.TEST_DATABASE_URL as string, { prepare: false }), { schema: s });
  return { db: conn, dbNode: conn };
});

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
const USER = 'notes-list-u1';

suite('listNotes (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const tripIds: string[] = [];

  beforeAll(async () => {
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES (${USER},'L','notes-list@t.local') ON CONFLICT (id) DO NOTHING`;
  });

  afterAll(async () => {
    if (tripIds.length) await database.delete(trips).where(inArray(trips.id, tripIds));
    await client?.end();
  });

  async function seedTrip(itemText: string) {
    const [t] = await database.insert(trips).values({ ownerId: USER, title: `nl-${Date.now()}` }).returning({ id: trips.id });
    tripIds.push(t.id);
    const [n] = await database.insert(notes).values({ tripId: t.id, idx: 0, kind: 'checklist', title: 'C' }).returning({ id: notes.id });
    await database.insert(checklistItems).values({ noteId: n.id, idx: 0, text: itemText });
    return t.id;
  }

  it("returns each note with only its own items", async () => {
    const { listNotes } = await import('./note-service');
    const a = await seedTrip('mine');
    await seedTrip('other');
    const out = await listNotes(USER, a);
    expect(out).toHaveLength(1);
    expect(out[0].items.map((i) => i.text)).toEqual(['mine']);
  });
});
