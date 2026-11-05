// [API-CHK] reorderChecklistItems against Postgres. Gated on TEST_DATABASE_URL.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, notes, checklistItems, tripMemberships } from '@/db/schema';
import type { dbNode } from '@/db';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
const OWNER = 'chk-owner';
const VIEWER = 'chk-viewer';

suite('reorderChecklistItems ([API-CHK])', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let reorder: typeof import('./note-service').reorderChecklistItems;
  const tripIds: string[] = [];
  const tx = () => database as unknown as typeof dbNode;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    ({ reorderChecklistItems: reorder } = await import('./note-service'));
    await client`INSERT INTO "user"(id,name,email) VALUES (${OWNER},'O','chk-o@t.local'),(${VIEWER},'V','chk-v@t.local') ON CONFLICT (id) DO NOTHING`;
  });
  afterAll(async () => {
    for (const id of tripIds) await database.delete(trips).where(eq(trips.id, id));
    await client?.end();
  });

  async function seed(texts = ['a', 'b', 'c']) {
    const [t] = await database.insert(trips).values({ ownerId: OWNER, title: `chk-${Date.now()}` }).returning({ id: trips.id });
    tripIds.push(t.id);
    await database.insert(tripMemberships).values({ tripId: t.id, userId: VIEWER, role: 'viewer' });
    const [n] = await database.insert(notes).values({ tripId: t.id, idx: 0, kind: 'checklist', title: 'C' }).returning({ id: notes.id });
    const rows = await database
      .insert(checklistItems)
      .values(texts.map((text, idx) => ({ noteId: n.id, idx, text })))
      .returning({ id: checklistItems.id, text: checklistItems.text });
    return { noteId: n.id, id: Object.fromEntries(rows.map((r) => [r.text, r.id])) as Record<string, string> };
  }
  const order = async (noteId: string) =>
    (await database.select({ t: checklistItems.text, i: checklistItems.idx }).from(checklistItems).where(eq(checklistItems.noteId, noteId)).orderBy(asc(checklistItems.idx))).map((r) => `${r.i}${r.t}`);

  it('applies the new order with contiguous idx', async () => {
    const s = await seed();
    const out = await reorder(OWNER, s.noteId, [s.id.c, s.id.a, s.id.b], tx());
    expect(out.items.map((i) => i.text)).toEqual(['c', 'a', 'b']);
    expect(await order(s.noteId)).toEqual(['0c', '1a', '2b']);
  });

  it('rejects a partial list, duplicates, or another note\'s item — and changes nothing', async () => {
    const s = await seed();
    const other = await seed(['x']);
    for (const bad of [[s.id.a, s.id.b], [s.id.a, s.id.a, s.id.b], [s.id.a, s.id.b, other.id.x], 'nope']) {
      await expect(reorder(OWNER, s.noteId, bad, tx())).rejects.toMatchObject({ code: 'bad_request' });
    }
    expect(await order(s.noteId)).toEqual(['0a', '1b', '2c']);
    expect(await order(other.noteId)).toEqual(['0x']);
  });

  it('a viewer cannot reorder', async () => {
    const s = await seed();
    await expect(reorder(VIEWER, s.noteId, [s.id.c, s.id.b, s.id.a], tx())).rejects.toMatchObject({ code: 'forbidden' });
  });
});
