// Integration test for POST /api/v1/trips/:tripId/hotels atomic idempotency.
// Gated on TEST_DATABASE_URL. Drives withIdempotencyAtomic with an injected
// client and a run(tx) mirroring the route body (real threaded createHotel,
// which authorizes + writes on the tx). Entity-returning shape: no read-back.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, hotelBookings } from '@/db/schema';
import { createHotel } from '@/lib/services/booking-service';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import type { IdemExecutor } from '@/lib/api/idempotency';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'hotels-u1';

function reqWithKey(key: string, tripId: string): Request {
  const headers = new Headers();
  headers.set('idempotency-key', key);
  return new Request(`http://t.local/api/v1/trips/${tripId}/hotels`, {
    method: 'POST',
    headers,
  });
}

suite('POST /api/v1/trips/:tripId/hotels (atomic idempotency)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let tripId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('hotels-u1','H','hotels@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `hotels-trip-${Date.now()}` })
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

  const runFor = (name: string) => async (tx: IdemExecutor) => {
    const hotel = await createHotel(USER, tripId, { name }, tx);
    return { status: 201, body: { hotel } };
  };

  it('creates one hotel and replays the retry without duplicating', async () => {
    const name = `Ryokan-${Date.now()}`;
    const key = `hotels-${Date.now()}`;
    const r1 = await withIdempotencyAtomic(USER, reqWithKey(key, tripId), { name }, runFor(name), deps());
    const b1 = await r1.json();
    expect(r1.status).toBe(201);
    expect(b1.hotel.name).toBe(name);

    const r2 = await withIdempotencyAtomic(USER, reqWithKey(key, tripId), { name }, runFor(name), deps());
    const b2 = await r2.json();
    expect(b2).toEqual(b1); // replay

    const rows = await database
      .select()
      .from(hotelBookings)
      .where(eq(hotelBookings.tripId, tripId));
    expect(rows).toHaveLength(1); // no duplicate
  });

  it('tbd POST replays the same hotel and warnings without duplicating', async () => {
    const area = `Dogo-${Date.now()}`;
    const body = { status: 'tbd', area };
    // The route's prepareHotelCreate output (resolved outside the tx).
    const prep = {
      body: { status: 'tbd', area, name: area, lat: null, lng: null, placeIdExternal: null },
      server: { coordsApprox: false },
      warnings: [{ code: 'hotel_without_location', message: 'm' }],
    };
    const run = async (tx: IdemExecutor) => ({
      status: 201,
      body: { hotel: await createHotel(USER, tripId, prep.body, tx, prep.server), warnings: prep.warnings },
    });
    const key = `hotels-tbd-${Date.now()}`;
    const r1 = await withIdempotencyAtomic(USER, reqWithKey(key, tripId), body, run, deps());
    const b1 = await r1.json();
    expect(r1.status).toBe(201);
    expect(b1.hotel).toMatchObject({ name: area, area, status: 'tbd', coordsApprox: false, lat: null });
    expect(b1.warnings).toEqual(prep.warnings);

    const r2 = await withIdempotencyAtomic(USER, reqWithKey(key, tripId), body, run, deps());
    expect(r2.status).toBe(201);
    expect(await r2.json()).toEqual(b1); // replay: same hotel + warnings

    const rows = await database
      .select()
      .from(hotelBookings)
      .where(and(eq(hotelBookings.tripId, tripId), eq(hotelBookings.area, area)));
    expect(rows).toHaveLength(1);
  });

  it('stores a tbd hotel with area as name and server-set coordsApprox', async () => {
    const row = await createHotel(USER, tripId, { status: 'tbd', area: 'Dogo Onsen', lat: 33.85, lng: 132.79 }, database as unknown as IdemExecutor, { coordsApprox: true });
    expect(row).toMatchObject({ name: 'Dogo Onsen', area: 'Dogo Onsen', status: 'tbd', coordsApprox: true });
  });

  it('ignores a client coordsApprox in the body', async () => {
    const row = await createHotel(USER, tripId, { name: 'H', coordsApprox: true }, database as unknown as IdemExecutor);
    expect(row.coordsApprox).toBe(false);
    expect(row.status).toBe('confirmed');
  });

  it('rejects a bad status with bad_request before writing', async () => {
    await expect(createHotel(USER, tripId, { name: 'H', status: 'x' }, database as unknown as IdemExecutor)).rejects.toMatchObject({ code: 'bad_request' });
  });
});
