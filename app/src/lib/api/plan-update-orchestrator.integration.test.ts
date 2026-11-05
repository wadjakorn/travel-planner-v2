// PUT /trips/:tripId/plan end to end against Postgres (TP-0146). Gated on
// TEST_DATABASE_URL; loadApiTrip is stubbed (neon-http), audit is mocked.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { asc, eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days, places, segments, auditLog } from '@/db/schema';
import type { dbNode } from '@/db';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
const USER = 'plan-put-u1';

suite('putTripPlan (integration, TP-0146)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let putTripPlan: typeof import('./plan-update-orchestrator').putTripPlan;
  const tripIds: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES (${USER},'P','plan-put@t.local') ON CONFLICT (id) DO NOTHING`;
    ({ putTripPlan } = await import('./plan-update-orchestrator'));
  });
  afterAll(async () => {
    if (tripIds.length) await database.delete(trips).where(inArray(trips.id, tripIds));
    await client?.end();
  });

  // d1: a → b → c (legs "ab", "bc"); d2: x.
  async function seed() {
    const [t] = await database.insert(trips).values({ ownerId: USER, title: `plan-${Date.now()}` }).returning();
    tripIds.push(t.id);
    const mk = (idx: number) => ({ tripId: t.id, idx, label: 'Mon', num: idx + 1, date: 'Monday', title: `Day ${idx + 1}` });
    const [d1, d2] = await database.insert(days).values([mk(0), mk(1)]).returning({ id: days.id });
    const ins = (dayId: string, idx: number, name: string) => ({ dayId, idx, kind: 'sight' as const, name, lat: 35 + idx, lng: 135 });
    const ps = await database
      .insert(places)
      .values([ins(d1.id, 0, 'a'), ins(d1.id, 1, 'b'), ins(d1.id, 2, 'c'), ins(d2.id, 0, 'x')])
      .returning({ id: places.id, name: places.name });
    const id = Object.fromEntries(ps.map((p) => [p.name, p.id])) as Record<'a' | 'b' | 'c' | 'x', string>;
    const seg = (dayId: string, idx: number, note: string) => ({ dayId, idx, mode: 'walk' as const, distance: '', time: '', note, durationMin: 5 });
    await database.insert(segments).values([seg(d1.id, 0, 'ab'), seg(d1.id, 1, 'bc')]);
    const [row] = await database.select({ u: trips.updatedAt }).from(trips).where(eq(trips.id, t.id));
    return { tripId: t.id, d1: d1.id, d2: d2.id, id, version: row.u.toISOString() };
  }

  const txDb = () => database as unknown as typeof dbNode;
  const deps = (over: Partial<Record<string, unknown>> = {}) =>
    ({ loadApiTrip: async (id: string) => ({ id }), idemDb: database, txDb: txDb(), link: { textSearch: null }, ...over }) as never;
  const req = (key?: string) =>
    new Request('http://t.local/api/v1/trips/x/plan', { method: 'PUT', headers: key ? { 'idempotency-key': key } : {} });

  const orderOf = async (dayId: string) =>
    (await database.select({ name: places.name }).from(places).where(eq(places.dayId, dayId)).orderBy(asc(places.idx))).map((p) => p.name);
  const legsOf = async (dayId: string) =>
    (await database.select({ idx: segments.idx, note: segments.note }).from(segments).where(eq(segments.dayId, dayId)).orderBy(asc(segments.idx)));

  it('reorders, moves a pair across days with its leg note, creates, and lets a body arrive win', async () => {
    const s = await seed();
    const res = await putTripPlan(USER, s.tripId, req(), {
      days: [
        { id: s.d1, title: 'Moved out', places: [{ id: s.id.a }] },
        { id: s.d2, places: [{ id: s.id.x }, { id: s.id.b }, { id: s.id.c }, { kind: 'food', name: 'n', lat: 1, lng: 1, arrive: { mode: 'drive', note: 'taxi' } }] },
      ],
    }, deps());
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(await orderOf(s.d1)).toEqual(['a']);
    expect(await orderOf(s.d2)).toEqual(['x', 'b', 'c', 'n']);
    // x→b is new (no note); b→c moved together and keeps "bc"; c→n is the body arrive.
    expect(await legsOf(s.d2)).toEqual([
      { idx: 0, note: null },
      { idx: 1, note: 'bc' },
      { idx: 2, note: 'taxi' },
    ]);
    expect(await legsOf(s.d1)).toEqual([]);
    expect(out.diff.days.updated).toEqual([{ id: s.d1, fields: ['title'] }]);
    expect(out.diff.places.moved.map((m: { id: string }) => m.id).sort()).toEqual([s.id.b, s.id.c].sort());
    expect(out.diff.places.created).toEqual([{ path: '/days/1/places/3', name: 'n' }]);
  });

  it('prune deletes the unlisted places of a sent day (needs ifUpdatedAt)', async () => {
    const s = await seed();
    await putTripPlan(USER, s.tripId, req(), { ifUpdatedAt: s.version, prune: true, days: [{ id: s.d1, places: [{ id: s.id.c }, { id: s.id.a }] }, { id: s.d2 }] }, deps());
    expect(await orderOf(s.d1)).toEqual(['c', 'a']);
    expect(await orderOf(s.d2)).toEqual(['x']);
    expect(await legsOf(s.d1)).toHaveLength(1);
  });

  it('409 when ifUpdatedAt is stale; nothing written', async () => {
    const s = await seed();
    await expect(
      putTripPlan(USER, s.tripId, req(), { ifUpdatedAt: '2000-01-01T00:00:00.000Z', days: [{ id: s.d1, places: [{ id: s.id.c }] }, { id: s.d2 }] }, deps()),
    ).rejects.toMatchObject({ code: 'conflict', extra: { reason: 'version_mismatch' } });
    expect(await orderOf(s.d1)).toEqual(['a', 'b', 'c']);
  });

  it('409 when the trip changes between the snapshot and the write tx; the claim is released', async () => {
    const s = await seed();
    let n = 0;
    const racing = {
      transaction: async (fn: never, cfg?: never) => {
        if (++n === 2) await database.update(places).set({ idx: 9 }).where(eq(places.id, s.id.c)); // a concurrent reorder
        return database.transaction(fn, cfg);
      },
    };
    const key = `plan-race-${Date.now()}`;
    const body = { days: [{ id: s.d1, places: [{ id: s.id.b }] }, { id: s.d2 }] };
    await expect(putTripPlan(USER, s.tripId, req(key), body, deps({ txDb: racing }))).rejects.toMatchObject({
      code: 'conflict',
      extra: { reason: 'plan_changed' },
    });
    // Same key works after a fresh read (claim released, not a 409 replay).
    const ok = await putTripPlan(USER, s.tripId, req(key), body, deps());
    expect(ok.status).toBe(200);
    expect((await orderOf(s.d1))[0]).toBe('b');
  });

  it('dryRun writes nothing; an idempotent retry replays the diff', async () => {
    const s = await seed();
    const body = { days: [{ id: s.d1, places: [{ id: s.id.c }] }, { id: s.d2 }] };
    const dry = await (await putTripPlan(USER, s.tripId, req(), { ...body, dryRun: true }, deps())).json();
    expect(dry.trip).toBeNull();
    expect(dry.diff.places.moved).toEqual([{ id: s.id.c, fromDay: s.d1, from: 2, toDay: s.d1, to: 0 }]);
    expect(await orderOf(s.d1)).toEqual(['a', 'b', 'c']);
    const key = `plan-idem-${Date.now()}`;
    const r1 = await (await putTripPlan(USER, s.tripId, req(key), body, deps())).json();
    const r2 = await (await putTripPlan(USER, s.tripId, req(key), body, deps())).json();
    expect(r2.diff).toEqual(r1.diff);
    expect(await orderOf(s.d1)).toEqual(['c', 'a', 'b']);
    void auditLog;
  });
});
