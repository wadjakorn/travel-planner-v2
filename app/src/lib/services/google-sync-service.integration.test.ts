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
import { purgeExpiredVolatile } from '@/lib/services/google-sync-service';
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
  kind: 'food', name: 'Jay Fai', category: null, rating: 4.4, reviews: 1234, time: null, duration: null,
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
  let nextIdx = 0;
  const exec = () => database as unknown as IdemExecutor;

  const row = async (id: string) => {
    const [r] = await database.select().from(places).where(eq(places.id, id)).limit(1);
    return r;
  };
  const seed = async (v: Partial<typeof places.$inferInsert>) => {
    const [r] = await database
      .insert(places)
      .values({ dayId, idx: nextIdx++, kind: 'food', name: 'seed', ...v })
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
