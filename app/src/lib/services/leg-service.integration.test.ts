// Integration test for the leg service + transactional removePlace /
// reorderPlaces note realignment (TP-0141, spec §1.4). Gated on
// TEST_DATABASE_URL. Seeds with the postgres-js client and injects it as
// `txDb`, mirroring days/[dayId]/places/route.integration.test.ts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days, places, segments, tripMemberships } from '@/db/schema';
import type { dbNode } from '@/db';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { removePlace, reorderPlaces, updatePlace } from '@/lib/services/place-service';
import { parsePlaceFields } from '@/lib/api/place-input';
import {
  applyPlaceArrive,
  lockDay,
  normalizeDayLegs,
  readArriveView,
  setPlaceArrive,
} from '@/lib/services/leg-service';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'legs-u1';

suite('leg service + transactional reorder/remove', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let tripId: string;
  let dayCounter = 0;

  const txDb = () => database as unknown as typeof dbNode;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('legs-u1','L','legs@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `legs-trip-${Date.now()}` })
      .returning({ id: trips.id });
    tripId = t.id;
  });

  afterAll(async () => {
    if (tripId) await database.delete(trips).where(eq(trips.id, tripId));
    await client?.end();
  });

  // Day with places a,b,c,d (idx 0..3), segments idx 0..2 at
  // drive/walk/transit with notes 'ab','bc','cd', start_note 'Sa'.
  async function seedDay() {
    const [d] = await database
      .insert(days)
      .values({
        tripId,
        idx: dayCounter++,
        label: 'Mon',
        num: 1,
        date: 'Monday, Jan 1',
        title: 'Day',
        startMode: 'walk',
        startNote: 'Sa',
        startDurationMin: 5,
      })
      .returning({ id: days.id });
    const ids: Record<'a' | 'b' | 'c' | 'd', string> = { a: '', b: '', c: '', d: '' };
    const names = ['a', 'b', 'c', 'd'] as const;
    for (let i = 0; i < names.length; i++) {
      const [p] = await database
        .insert(places)
        .values({ dayId: d.id, idx: i, kind: 'sight', name: names[i] })
        .returning({ id: places.id });
      ids[names[i]] = p.id;
    }
    const modes = ['drive', 'walk', 'transit'] as const;
    const notes = ['ab', 'bc', 'cd'];
    for (let i = 0; i < 3; i++) {
      await database.insert(segments).values({
        dayId: d.id,
        idx: i,
        mode: modes[i],
        distance: '',
        time: '',
        note: notes[i],
        durationMin: (i + 1) * 10,
      });
    }
    return { dayId: d.id, ...ids };
  }

  const segRows = (dayId: string) =>
    database
      .select({
        id: segments.id,
        idx: segments.idx,
        mode: segments.mode,
        note: segments.note,
        durationMin: segments.durationMin,
      })
      .from(segments)
      .where(eq(segments.dayId, dayId))
      .orderBy(asc(segments.idx));

  const placeOrder = async (dayId: string) =>
    (
      await database
        .select({ id: places.id })
        .from(places)
        .where(eq(places.dayId, dayId))
        .orderBy(asc(places.idx))
    ).map((r) => r.id);

  const placeIdxs = async (dayId: string) =>
    (
      await database
        .select({ idx: places.idx })
        .from(places)
        .where(eq(places.dayId, dayId))
        .orderBy(asc(places.idx))
    ).map((r) => r.idx);

  // Poll until some backend in this DB is waiting on a row/relation lock.
  async function waitForLockWaiter() {
    for (let i = 0; i < 100; i++) {
      const [r] = await client`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (r.n > 0) return;
      await new Promise((res) => setTimeout(res, 20));
    }
    throw new Error('removePlace never blocked on the day lock');
  }

  const dayRow = async (dayId: string) =>
    (
      await database
        .select({
          startMode: days.startMode,
          startNote: days.startNote,
          startDurationMin: days.startDurationMin,
        })
        .from(days)
        .where(eq(days.id, dayId))
    )[0];

  it('reorder keeps rows and modes positional and moves notes with their pair', async () => {
    const s = await seedDay();
    const before = await segRows(s.dayId);
    await reorderPlaces(USER, s.dayId, [s.b, s.a, s.c, s.d], txDb());
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.mode)).toEqual(['drive', 'walk', 'transit']);
    expect(after.map((r) => r.note)).toEqual([null, null, 'cd']);
    expect(after.map((r) => r.durationMin)).toEqual([null, null, 30]);
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    const day = await dayRow(s.dayId);
    expect(day.startNote).toBeNull(); // START>b is a new pair
    expect(day.startDurationMin).toBeNull();
    expect(day.startMode).toBe('walk');
  });

  it('reorder with an incomplete list reads the new order from the DB', async () => {
    const s = await seedDay();
    await reorderPlaces(USER, s.dayId, [s.c, s.a], txDb());
    expect(await placeOrder(s.dayId)).toEqual([s.c, s.a, s.b, s.d]);
    const after = await segRows(s.dayId);
    expect(after).toHaveLength(3);
    // pairs c>a (new), a>b ('ab'), b>d (new); START>c new
    expect(after.map((r) => r.note)).toEqual([null, 'ab', null]);
    expect((await dayRow(s.dayId)).startNote).toBeNull();
  });

  it('reorder keeping place 0 keeps start_note', async () => {
    const s = await seedDay();
    await reorderPlaces(USER, s.dayId, [s.a, s.c, s.b, s.d], txDb());
    const day = await dayRow(s.dayId);
    expect(day.startNote).toBe('Sa');
    expect(day.startDurationMin).toBe(5);
  });

  it('remove middle keeps the surviving pair note', async () => {
    const s = await seedDay();
    const before = await segRows(s.dayId);
    await removePlace(USER, s.b, txDb());
    const after = await segRows(s.dayId);
    expect(after).toHaveLength(2);
    expect(after.map((r) => r.note)).toEqual([null, 'cd']);
    // no new rows: every surviving id existed before
    const beforeIds = new Set(before.map((r) => r.id));
    for (const r of after) expect(beforeIds.has(r.id)).toBe(true);
    expect((await dayRow(s.dayId)).startNote).toBe('Sa');
  });

  it('remove place 0 clears start_note and keeps start_mode', async () => {
    const s = await seedDay();
    await removePlace(USER, s.a, txDb());
    const day = await dayRow(s.dayId);
    expect(day.startNote).toBeNull();
    expect(day.startDurationMin).toBeNull();
    expect(day.startMode).toBe('walk');
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.note)).toEqual(['bc', 'cd']);
  });

  it('remove keeps every remaining leg row (mode picker survives)', async () => {
    const s = await seedDay();
    await removePlace(USER, s.c, txDb());
    const order = await placeOrder(s.dayId);
    const after = await segRows(s.dayId);
    expect(order).toEqual([s.a, s.b, s.d]);
    expect(after).toHaveLength(order.length - 1);
    expect(after.map((r) => r.idx)).toEqual([0, 1]);
    expect(after.map((r) => r.note)).toEqual(['ab', null]);
  });

  it('remove after a committed reorder uses the current idx', async () => {
    const s = await seedDay();
    await reorderPlaces(USER, s.dayId, [s.b, s.a, s.c, s.d], txDb());
    await removePlace(USER, s.b, txDb());
    expect(await placeIdxs(s.dayId)).toEqual([0, 1, 2]);
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.idx)).toEqual([0, 1]);
    expect(after.map((r) => r.mode)).toEqual(['walk', 'transit']); // drive (b>a) row gone
  });

  it('remove re-reads idx after the lock when a reorder commits mid-flight', async () => {
    const s = await seedDay();
    const before = await segRows(s.dayId);
    let removing: Promise<unknown> | undefined;
    await database.transaction(async (txA) => {
      await lockDay(txA, s.dayId);
      // B: authz reads b at idx 1, then blocks on the day lock held by A.
      removing = removePlace(USER, s.b, txDb());
      await waitForLockWaiter();
      // A: move b to idx 0 (savepoint inside A), then commit.
      await reorderPlaces(USER, s.dayId, [s.b, s.a, s.c, s.d], txA as unknown as typeof dbNode);
    });
    await expect(removing).resolves.toEqual({ tripId });
    expect(await placeOrder(s.dayId)).toEqual([s.a, s.c, s.d]);
    expect(await placeIdxs(s.dayId)).toEqual([0, 1, 2]);
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.idx)).toEqual([0, 1]);
    // b was at live position 0 → its outgoing segment (idx 0, drive) is gone.
    expect(after.map((r) => r.id)).toEqual([before[1].id, before[2].id]);
    expect(after.map((r) => r.mode)).toEqual(['walk', 'transit']);
    expect(after.map((r) => r.note)).toEqual([null, 'cd']);
  });

  it('writes arrive by live position, not raw idx', async () => {
    const s = await seedDay();
    // drop segment idx 2 and park d at a high idx (stale partial reorder)
    await database
      .delete(segments)
      .where(and(eq(segments.dayId, s.dayId), eq(segments.idx, 2)));
    await database.update(places).set({ idx: 1_000_003 }).where(eq(places.id, s.d));
    await database.transaction(async (tx) => {
      await applyPlaceArrive(tx, s.d, { mode: 'transit', durationMin: 40, note: 'train' });
    });
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.idx)).toEqual([0, 1, 2]);
    expect(after[2]).toMatchObject({ mode: 'transit', note: 'train', durationMin: 40 });
    expect(await readArriveView(database as unknown as IdemExecutor, s.d)).toEqual({
      mode: 'transit',
      durationMin: 40,
      note: 'train',
    });
  });

  it('arrive null on a segment clears note/duration and keeps mode + row', async () => {
    const s = await seedDay();
    const before = await segRows(s.dayId);
    const res = await setPlaceArrive(USER, s.c, null, txDb());
    expect(res.tripId).toBe(tripId);
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect(after[1]).toMatchObject({ mode: 'walk', note: null, durationMin: null });
    expect(res.arrive).toEqual({ mode: 'walk', note: null, durationMin: null });
    // set again: updates mode/note/duration on the same row
    const res2 = await setPlaceArrive(
      USER,
      s.c,
      { mode: 'drive', durationMin: 15, note: 'toll' },
      txDb(),
    );
    expect(res2.arrive).toEqual({ mode: 'drive', durationMin: 15, note: 'toll' });
    const again = await segRows(s.dayId);
    expect(again[1]).toMatchObject({ id: before[1].id, mode: 'drive', note: 'toll' });
  });

  it('arrive on place 0 writes day.start_*; null clears all three', async () => {
    const s = await seedDay();
    const res = await setPlaceArrive(
      USER,
      s.a,
      { mode: 'transit', durationMin: 25, note: 'bus' },
      txDb(),
    );
    expect(res.arrive).toEqual({ mode: 'transit', durationMin: 25, note: 'bus' });
    expect(await dayRow(s.dayId)).toEqual({
      startMode: 'transit',
      startNote: 'bus',
      startDurationMin: 25,
    });
    const cleared = await setPlaceArrive(USER, s.a, null, txDb());
    expect(cleared.arrive).toBeNull();
    expect(await dayRow(s.dayId)).toEqual({
      startMode: null,
      startNote: null,
      startDurationMin: null,
    });
    expect(await segRows(s.dayId)).toHaveLength(3);
  });

  it('setPlaceArrive PUT then DELETE', async () => {
    const s = await seedDay();
    const put = await setPlaceArrive(USER, s.b, { mode: 'transit', durationMin: 90, note: 'Ferry' }, txDb());
    expect(put).toEqual({ tripId, arrive: { mode: 'transit', durationMin: 90, note: 'Ferry' } });
    expect((await segRows(s.dayId))[0]).toMatchObject({ mode: 'transit', note: 'Ferry', durationMin: 90 });
    const del = await setPlaceArrive(USER, s.b, null, txDb());
    expect(del.tripId).toBe(tripId);
    expect((await segRows(s.dayId))[0]).toMatchObject({ mode: 'transit', note: null, durationMin: null });
  });

  it('viewer cannot write arrive', async () => {
    const s = await seedDay();
    await client`INSERT INTO "user"(id,name,email) VALUES ('legs-viewer','V','legs-viewer@t.local') ON CONFLICT (id) DO NOTHING`;
    await database
      .insert(tripMemberships)
      .values({ tripId, userId: 'legs-viewer', role: 'viewer' })
      .onConflictDoNothing();
    const segsBefore = await segRows(s.dayId);
    const dayBefore = await dayRow(s.dayId);
    await expect(
      setPlaceArrive('legs-viewer', s.b, { mode: 'walk', durationMin: 1, note: 'x' }, txDb()),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setPlaceArrive('legs-viewer', s.a, null, txDb())).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(await segRows(s.dayId)).toEqual(segsBefore);
    expect(await dayRow(s.dayId)).toEqual(dayBefore);
  });

  it('PATCH path without arrive leaves the leg untouched', async () => {
    const s = await seedDay();
    const before = await segRows(s.dayId);
    const dayBefore = await dayRow(s.dayId);
    await database.transaction(async (tx) => {
      await updatePlace(USER, s.b, parsePlaceFields({ name: 'b2', kind: 'food' }), undefined, tx);
    });
    expect(await segRows(s.dayId)).toEqual(before);
    expect(before[0].note).toBe('ab');
    expect(await dayRow(s.dayId)).toEqual(dayBefore);
  });

  // ── TP-0150: rows = places − 1 after remove / reorder (REQUIREMENTS:57). ──

  // Day with `n` places p0..p(n-1) at `idxs` (default 0..n-1) and segment rows
  // at `rows` (idx → mode, note `r<idx>`). No start_*.
  async function seedSparse(
    n: number,
    rows: Record<number, 'drive' | 'walk' | 'transit'>,
    opts: { idxs?: number[]; defaultMode?: 'drive' | 'walk' | 'transit' } = {},
  ) {
    const [d] = await database
      .insert(days)
      .values({
        tripId,
        idx: dayCounter++,
        label: 'Tue',
        num: 2,
        date: 'Tuesday, Jan 2',
        title: 'Sparse',
        defaultMode: opts.defaultMode ?? null,
      })
      .returning({ id: days.id });
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const [p] = await database
        .insert(places)
        .values({ dayId: d.id, idx: opts.idxs?.[i] ?? i, kind: 'sight', name: `p${i}` })
        .returning({ id: places.id });
      ids.push(p.id);
    }
    for (const [idx, mode] of Object.entries(rows)) {
      await database
        .insert(segments)
        .values({ dayId: d.id, idx: Number(idx), mode, distance: '', time: '', note: `r${idx}` });
    }
    return { dayId: d.id, ids };
  }

  it('TP-0150: remove last place leaves exactly n-1 rows', async () => {
    const s = await seedSparse(3, { 0: 'walk', 1: 'transit' });
    const before = await segRows(s.dayId);
    await removePlace(USER, s.ids[2], txDb());
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.idx)).toEqual([0]);
    expect(after[0]).toMatchObject({ id: before[0].id, mode: 'walk', note: 'r0' });
  });

  it('TP-0150: partial reorder compacts parked places and fills their rows', async () => {
    const s = await seedDay();
    const before = await segRows(s.dayId);
    await reorderPlaces(USER, s.dayId, [s.c, s.a], txDb());
    expect(await placeOrder(s.dayId)).toEqual([s.c, s.a, s.b, s.d]);
    expect(await placeIdxs(s.dayId)).toEqual([0, 1, 2, 3]);
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.idx)).toEqual([0, 1, 2]);
    expect(after.map((r) => r.mode)).toEqual(['drive', 'walk', 'transit']);
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
    expect(after.map((r) => r.note)).toEqual([null, 'ab', null]);
  });

  it('TP-0150: remove a parked place from the middle keeps positional modes', async () => {
    const s = await seedDay();
    // Live order c, a, b, d with a/b/d parked by a stale partial reorder.
    await database.update(places).set({ idx: 1_000_000 }).where(eq(places.id, s.a));
    await database.update(places).set({ idx: 1_000_001 }).where(eq(places.id, s.b));
    await database.update(places).set({ idx: 1_000_002 }).where(eq(places.id, s.d));
    await database.update(places).set({ idx: 0 }).where(eq(places.id, s.c));
    await removePlace(USER, s.a, txDb());
    expect(await placeOrder(s.dayId)).toEqual([s.c, s.b, s.d]);
    expect(await placeIdxs(s.dayId)).toEqual([0, 1, 2]);
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.idx)).toEqual([0, 1]);
    expect(after.map((r) => r.mode)).toEqual(['drive', 'transit']);
  });

  it('TP-0150: legacy sparse day gets default rows on reorder', async () => {
    const s = await seedSparse(3, {}, { defaultMode: 'walk' });
    await reorderPlaces(USER, s.dayId, [s.ids[1], s.ids[0], s.ids[2]], txDb());
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.idx)).toEqual([0, 1]);
    expect(after.map((r) => r.mode)).toEqual(['walk', 'walk']);
  });

  it('TP-0150: a day that is already correct is untouched', async () => {
    const s = await seedDay();
    const segsBefore = await segRows(s.dayId);
    const stamp = async () =>
      (
        await database
          .select({ idx: places.idx, updatedAt: places.updatedAt })
          .from(places)
          .where(eq(places.dayId, s.dayId))
          .orderBy(asc(places.idx))
      ).map((r) => `${r.idx}@${r.updatedAt.toISOString()}`);
    const placesBefore = await stamp();
    const dayBefore = await dayRow(s.dayId);
    await database.transaction(async (tx) => {
      await lockDay(tx, s.dayId);
      await normalizeDayLegs(tx, s.dayId);
    });
    expect(await segRows(s.dayId)).toEqual(segsBefore);
    expect(await stamp()).toEqual(placesBefore);
    expect(await dayRow(s.dayId)).toEqual(dayBefore);
  });

  it('TP-0150: removing down to one place / zero places leaves zero rows', async () => {
    // Orphan row 2 (= n-1) left over from the old remove-last bug.
    const s = await seedSparse(3, { 0: 'drive', 1: 'walk', 2: 'transit' });
    await removePlace(USER, s.ids[1], txDb());
    expect((await segRows(s.dayId)).map((r) => r.idx)).toEqual([0]);
    await removePlace(USER, s.ids[2], txDb());
    expect(await segRows(s.dayId)).toEqual([]);
    await removePlace(USER, s.ids[0], txDb());
    expect(await segRows(s.dayId)).toEqual([]);
    expect(await placeOrder(s.dayId)).toEqual([]);
  });

  it('TP-0150: compaction does not change day.start_*', async () => {
    const s = await seedDay();
    const dayBefore = await dayRow(s.dayId);
    await reorderPlaces(USER, s.dayId, [s.a], txDb());
    expect(await placeIdxs(s.dayId)).toEqual([0, 1, 2, 3]);
    expect(await placeOrder(s.dayId)).toEqual([s.a, s.b, s.c, s.d]);
    expect(await dayRow(s.dayId)).toEqual(dayBefore);
  });

  it('TP-0150: syncLegRows keeps a concurrently written row (ON CONFLICT)', async () => {
    const s = await seedSparse(3, { 0: 'drive' }, { defaultMode: 'walk' });
    let reordering: Promise<unknown> | undefined;
    // B: a non-tx writer (setSegmentMode / ensureSegmentForAppendedPlace never
    // take the day lock) inserts row 1 but has not committed yet. Its FK check
    // holds FOR KEY SHARE on the day row, so the reorder blocks (on lockDay),
    // then must keep B's committed row instead of rolling back on the unique
    // index. ON CONFLICT is the belt-and-braces for that fill.
    await database.transaction(async (txB) => {
      await txB
        .insert(segments)
        .values({ dayId: s.dayId, idx: 1, mode: 'transit', distance: '', time: '' });
      reordering = reorderPlaces(USER, s.dayId, [s.ids[0], s.ids[1], s.ids[2]], txDb());
      await waitForLockWaiter();
    });
    await expect(reordering).resolves.toEqual({ tripId });
    const after = await segRows(s.dayId);
    expect(after.map((r) => r.idx)).toEqual([0, 1]);
    expect(after.map((r) => r.mode)).toEqual(['drive', 'transit']);
  });
});
