// Integration coverage for expiring Google data (TP-0047, resync design §3/§5).
// Gated on TEST_DATABASE_URL, so it SKIPS in CI — run it locally against a
// scratch database (migrated to 0017) before opening the PR.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days, places } from '@/db/schema';
import { addPlace, updatePlace, type PlaceFields } from '@/lib/services/place-service';
import { purgeExpiredVolatile, selectResyncCandidates, writeRefreshPatch } from '@/lib/services/google-sync-service';
import { parsePlaceFields } from '@/lib/api/place-input';
import type { FormBase, GooglePick } from '@/lib/places/google-sync';
import type { IdemExecutor } from '@/lib/api/idempotency';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'gsync-u1';
const now = new Date('2026-10-23T00:00:00Z');
const D = 86_400_000;
const ago = (ms: number) => new Date(now.getTime() - ms);

const F: PlaceFields = {
  kind: 'food', status: 'confirmed', sourceUrl: null,
  name: 'Jay Fai', category: null, rating: 4.4, reviews: 1234, time: null, duration: null,
  price: null, address: 'Old Rd', phone: '02', website: null, hours: 'H', tags: [], thumb: null, note: null,
  lat: 13.75, lng: 100.5, placeIdExternal: 'ChIJa',
};
const fullPick: GooglePick = {
  fields: 'full',
  snapshot: { name: 'Jay Fai', address: 'Old Rd', lat: 13.75, lng: 100.5, phone: '02', website: null },
};
const base: FormBase = {
  name: F.name, address: F.address, phone: F.phone, website: F.website, lat: F.lat, lng: F.lng,
  placeIdExternal: F.placeIdExternal, rating: F.rating, reviews: F.reviews, hours: F.hours,
};
const basicPickB: GooglePick = {
  fields: 'basic',
  snapshot: { name: 'Other', address: 'New Rd', lat: 13.8, lng: 100.6 },
};

suite('expiring Google data', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let tripId: string;
  let dayId: string;
  const exec = () => database as unknown as IdemExecutor;

  const row = async (id: string) => {
    const [r] = await database.select().from(places).where(eq(places.id, id)).limit(1);
    return r;
  };
  // addPlace also appends to this day, so take max(idx)+1 rather than a counter.
  const seed = async (v: Partial<typeof places.$inferInsert>) => {
    const [{ next }] = await client<{ next: number }[]>`
      SELECT COALESCE(MAX(idx), -1) + 1 AS next FROM place WHERE day_id = ${dayId}`;
    const [r] = await database
      .insert(places)
      .values({ dayId, idx: next, kind: 'food', name: 'seed', ...v })
      .returning({ id: places.id });
    return r.id;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    // The purge is global; start from a table with no expirable rows.
    await client`UPDATE place SET rating_synced_at = NULL, hours_synced_at = NULL`;
    await client`INSERT INTO "user"(id,name,email) VALUES (${USER},'G','gsync@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `gsync-trip-${Date.now()}` })
      .returning({ id: trips.id });
    tripId = t.id;
    const [d] = await database
      .insert(days)
      .values({ tripId, idx: 0, label: 'Mon', num: 1, date: 'Monday, Jan 1', title: 'Day 1' })
      .returning({ id: days.id });
    dayId = d.id;
  });

  afterAll(async () => {
    if (tripId) await client`DELETE FROM trip WHERE id = ${tripId}`;
    await client?.end();
  });

  it('purgeExpiredVolatile clears only expired groups', async () => {
    const old = new Date('2026-01-01T00:00:00Z');
    const A = await seed({ rating: 4, reviews: 9, ratingSyncedAt: ago(31 * D), updatedAt: old });
    const B = await seed({ rating: 4, reviews: 9, ratingSyncedAt: ago(29 * D) });
    const C = await seed({ rating: 4, ratingSyncedAt: null });
    const Dp = await seed({ hours: 'H', hoursSyncedAt: ago(31 * D), rating: 4, ratingSyncedAt: ago(1 * D) });
    const E = await seed({ rating: 4, reviews: 9, ratingSyncedAt: ago(31 * D), deletedAt: now });

    expect(await purgeExpiredVolatile(now, exec())).toEqual({ rating: 2, hours: 1 });

    for (const id of [A, E]) {
      expect(await row(id)).toMatchObject({ rating: null, reviews: null, ratingSyncedAt: null });
    }
    expect(await row(B)).toMatchObject({ rating: 4, reviews: 9, ratingSyncedAt: ago(29 * D) });
    expect(await row(C)).toMatchObject({ rating: 4, ratingSyncedAt: null });
    expect(await row(Dp)).toMatchObject({ hours: null, hoursSyncedAt: null, rating: 4, ratingSyncedAt: ago(1 * D) });
    expect((await row(A)).updatedAt).toEqual(old);
  });

  it('add with a full pick marks Google data; editing hours claims only hours', async () => {
    const { id } = await addPlace(USER, dayId, F, exec(), { googlePick: fullPick, now });
    expect(await row(id)).toMatchObject({ ratingSyncedAt: now, googleSnapshot: fullPick.snapshot });

    await updatePlace(USER, id, { ...F, hours: 'H2' }, { now }, exec());
    expect(await row(id)).toMatchObject({
      hoursSyncedAt: null, ratingSyncedAt: now, googleSnapshot: fullPick.snapshot,
    });
  });

  it('stale form: untouched units keep the background write', async () => {
    const { id } = await addPlace(USER, dayId, F, exec(), { googlePick: fullPick, now });
    await client`UPDATE place SET name = 'Jay Fai 2', rating = 4.5 WHERE id = ${id}`;

    await updatePlace(USER, id, { ...F, ...base, hours: 'H2' }, { formBase: base, now }, exec());
    expect(await row(id)).toMatchObject({
      name: 'Jay Fai 2', rating: 4.5, ratingSyncedAt: now, hours: 'H2', hoursSyncedAt: null,
    });
  });

  it("re-picking a different place clears the old place's Google data", async () => {
    const { id } = await addPlace(USER, dayId, F, exec(), { googlePick: fullPick, now });

    await updatePlace(
      USER, id,
      { ...F, ...base, name: 'Other', placeIdExternal: 'ChIJb', lat: 13.8 },
      { formBase: base, googlePick: basicPickB, now },
      exec(),
    );
    expect(await row(id)).toMatchObject({
      rating: null, reviews: null, hours: null, phone: null,
      ratingSyncedAt: null, hoursSyncedAt: null,
      googleSnapshot: basicPickB.snapshot, googleSyncedAt: null,
    });
  });

  it('PATCH full-replace clears the id, snapshot and status', async () => {
    const id = await seed({
      placeIdExternal: 'ChIJa', googleSnapshot: fullPick.snapshot, googleSyncedAt: now, googleStatus: 'OPERATIONAL',
    });
    await updatePlace(USER, id, parsePlaceFields({ kind: 'food', name: 'X' }), { now }, exec());
    expect(await row(id)).toMatchObject({
      placeIdExternal: null, googleSnapshot: null, googleSyncedAt: null, googleStatus: null,
    });
  });
});

suite('Google resync candidates', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const exec = () => database as unknown as IdemExecutor;
  const OWNER = 'gresync-u1';
  const tripIds: string[] = [];
  const dayOf: Record<string, string> = {};
  const IDS = ['p-null', 'p-30', 'p-26', 'p-24', 'p-nf', 'p-inv', 'p-geo', 'p-del', 'p-later', 'p-t2', 'p-t3', 'p-t4'];
  const mine = (ids: string[]) => ids.filter((id) => IDS.includes(id));
  const snap = { name: 'Jay Fai', address: 'Old Rd', lat: 13.75, lng: 100.5 };
  let idx = 0;

  const trip = async (key: string, v: Partial<typeof trips.$inferInsert>) => {
    const [t] = await database
      .insert(trips)
      .values({ ownerId: OWNER, title: `gresync-${key}-${Date.now()}`, ...v })
      .returning({ id: trips.id });
    tripIds.push(t.id);
    const [d] = await database
      .insert(days)
      .values({ tripId: t.id, idx: 0, label: 'Mon', num: 1, date: 'Monday, Jan 1', title: 'Day 1' })
      .returning({ id: days.id });
    dayOf[key] = d.id;
  };
  const seed = async (id: string, t: string, v: Partial<typeof places.$inferInsert> = {}) => {
    await database.insert(places).values({
      id, dayId: dayOf[t], idx: idx++, kind: 'food', name: 'seed', placeIdExternal: `ChIJ${id.replace('-', '')}`, ...v,
    });
  };

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`DELETE FROM place WHERE id = ANY(${IDS})`;
    await client`INSERT INTO "user"(id,name,email) VALUES (${OWNER},'G','gresync@t.local') ON CONFLICT (id) DO NOTHING`;
    await trip('T1', { startDate: '2026-10-20', endDate: '2026-10-23' });
    await trip('T2', { startDate: '2026-10-01', endDate: '2026-10-22' });
    await trip('T3', { startDate: '2026-09-01', endDate: null });
    await trip('T4', { startDate: '2026-10-01', endDate: '2026-12-01', deletedAt: now });
    await trip('T5', { startDate: '2026-11-01', endDate: '2026-11-05' });

    await seed('p-null', 'T1', { googleSnapshot: snap, rating: 4.4, reviews: 9, hours: 'H', ratingSyncedAt: ago(D) });
    await seed('p-30', 'T1', { googleSyncedAt: ago(30 * D) });
    await seed('p-26', 'T1', { googleSyncedAt: ago(26 * D) });
    await seed('p-24', 'T1', { googleSyncedAt: ago(24 * D) });
    await seed('p-nf', 'T1', { googleStatus: 'NOT_FOUND' });
    await seed('p-inv', 'T1', { googleStatus: 'INVALID' });
    await seed('p-geo', 'T1', { placeIdExternal: 'geoapify:x' });
    await seed('p-del', 'T1', { deletedAt: now });
    await seed('p-later', 'T5');
    await seed('p-t2', 'T2');
    await seed('p-t3', 'T3');
    await seed('p-t4', 'T4');
    await client`UPDATE place SET updated_at = '2026-10-20 10:00:00.123456' WHERE id = 'p-26'`;
  });

  afterAll(async () => {
    if (tripIds.length) await client`DELETE FROM trip WHERE id = ANY(${tripIds})`;
    await client?.end();
  });

  it('scratch DB has no foreign candidates', async () => {
    const ids = (await selectResyncCandidates(now, 1000, exec())).map((r) => r.id);
    const foreign = ids.filter((id) => !IDS.includes(id));
    expect(foreign, 'use a freshly migrated scratch DB').toEqual([]);
  });

  it('filters and orders: soonest trip first, then never-synced', async () => {
    expect(mine((await selectResyncCandidates(now, 10, exec())).map((r) => r.id))).toEqual([
      'p-null', 'p-30', 'p-26', 'p-later',
    ]);
    expect((await selectResyncCandidates(now, 2, exec())).map((r) => r.id)).toEqual(['p-null', 'p-30']);
  });

  it('rows carry every MergeRow column plus updatedAt', async () => {
    const [r] = await selectResyncCandidates(now, 1, exec());
    expect(r).toEqual({
      id: 'p-null', name: 'seed', address: null, lat: null, lng: null, phone: null, website: null,
      rating: 4.4, reviews: 9, hours: 'H', ratingSyncedAt: ago(D), hoursSyncedAt: null,
      googleSnapshot: snap, googleSyncedAt: null, googleStatus: null, placeIdExternal: 'ChIJpnull',
      updatedAt: expect.any(Date),
    });
  });

  it('conditional write matches an unchanged row (microsecond updated_at, non-UTC process)', async () => {
    const r = (await selectResyncCandidates(now, 10, exec())).find((x) => x.id === 'p-26')!;
    expect(r.updatedAt.toISOString()).toBe('2026-10-20T10:00:00.123Z');
    expect(await writeRefreshPatch('p-26', { name: 'N', googleSyncedAt: now }, r.updatedAt, exec())).toBe(true);
    const [after] = await client<{ name: string; synced: string; upd: string }[]>`
      SELECT name, google_synced_at::text AS synced, updated_at::text AS upd FROM place WHERE id = 'p-26'`;
    expect(after).toEqual({ name: 'N', synced: '2026-10-23 00:00:00', upd: '2026-10-20 10:00:00.123456' });
  });

  it('conditional write is a no-op after a user edit', async () => {
    const r = (await selectResyncCandidates(now, 10, exec())).find((x) => x.id === 'p-30')!;
    await client`UPDATE place SET updated_at = now() WHERE id = 'p-30'`;
    expect(await writeRefreshPatch('p-30', { name: 'N' }, r.updatedAt, exec())).toBe(false);
    const [after] = await client<{ name: string }[]>`SELECT name FROM place WHERE id = 'p-30'`;
    expect(after.name).toBe('seed');
  });
});
