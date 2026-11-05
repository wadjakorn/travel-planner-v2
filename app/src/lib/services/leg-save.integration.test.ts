// Integration test for saveLeg (TP-0152): the web sheet's write path must
// produce the same rows as the REST API's setPlaceArrive. Gated on
// TEST_DATABASE_URL; seeding follows leg-service.integration.test.ts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days, places, segments, hotelBookings } from '@/db/schema';
import type { dbNode } from '@/db';
import { setPlaceArrive } from '@/lib/services/leg-service';
import { saveLeg } from '@/lib/services/leg-save';
import { parseArrive } from '@/lib/api/arrive-input';
import { dayLegs } from '@/lib/day-augment';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const USER = 'legsave-u1';
const TRIP_START = '2030-01-01';

function iso(idx: number): string {
  const d = new Date(2030, 0, 1 + idx);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

suite('saveLeg', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let tripId: string;
  let dayCounter = 0;

  const txDb = () => database as unknown as typeof dbNode;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES ('legsave-u1','L','legsave@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `legsave-trip-${Date.now()}`, startDate: TRIP_START })
      .returning({ id: trips.id });
    tripId = t.id;
  });

  afterAll(async () => {
    if (tripId) await database.delete(trips).where(eq(trips.id, tripId));
    await client?.end();
  });

  // Day with places a,b,c,d and no segment rows.
  async function seedDay() {
    const idx = dayCounter++;
    const [d] = await database
      .insert(days)
      .values({ tripId, idx, label: 'Mon', num: idx + 1, date: 'Monday, Jan 1', title: 'Day' })
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
    return { dayId: d.id, idx, ...ids };
  }

  const segRows = async (dayId: string) =>
    (
      await database
        .select({
          idx: segments.idx,
          mode: segments.mode,
          note: segments.note,
          durationMin: segments.durationMin,
        })
        .from(segments)
        .where(eq(segments.dayId, dayId))
        .orderBy(asc(segments.idx))
    );

  it('web save and API PUT give the same rows', async () => {
    const x = await seedDay();
    const y = await seedDay();
    await saveLeg(
      USER,
      {
        target: 'arrive',
        dayId: x.dayId,
        placeId: x.b,
        after: x.a,
        mode: 'transit',
        durationMin: 40,
        note: ' rapi:t ',
      },
      txDb(),
    );
    await setPlaceArrive(
      USER,
      y.b,
      parseArrive({ mode: 'transit', durationMin: 40, note: ' rapi:t ' }),
      txDb(),
    );
    const want = [{ idx: 0, mode: 'transit', note: 'rapi:t', durationMin: 40 }];
    expect(await segRows(x.dayId)).toEqual(want);
    expect(await segRows(y.dayId)).toEqual(want);
  });

  it('start leg (after null) writes the day start leg', async () => {
    const x = await seedDay();
    await saveLeg(
      USER,
      { target: 'arrive', dayId: x.dayId, placeId: x.a, after: null, mode: 'walk', durationMin: 5, note: 'n' },
      txDb(),
    );
    const [d] = await database.select().from(days).where(eq(days.id, x.dayId));
    expect(d.startMode).toBe('walk');
    expect(d.startDurationMin).toBe(5);
    expect(d.startNote).toBe('n');
  });

  it('hotel leg sets the hotel mode for every night', async () => {
    const x = await seedDay();
    const y = await seedDay();
    expect(y.idx).toBe(x.idx + 1);
    const [h] = await database
      .insert(hotelBookings)
      .values({
        tripId,
        name: 'H',
        checkInDate: iso(x.idx),
        checkOutDate: iso(x.idx + 2),
      })
      .returning({ id: hotelBookings.id });
    await saveLeg(USER, { target: 'hotel', hotelId: h.id, leg: 'arrival', mode: 'walk' }, txDb());

    const [hotel] = await database.select().from(hotelBookings).where(eq(hotelBookings.id, h.id));
    for (const day of [x, y]) {
      const legs = dayLegs(
        {
          idx: day.idx,
          defaultMode: null,
          places: [day.a, day.b, day.c, day.d],
          segments: [],
        },
        [hotel],
        TRIP_START,
      );
      const arrival = legs.find((l) => l?.kind === 'hotel' && l.leg === 'arrival');
      expect(arrival?.mode).toBe('walk');
    }
  });

  it('rejects bad input with bad_request', async () => {
    const x = await seedDay();
    const base = { target: 'arrive' as const, dayId: x.dayId, placeId: x.b, after: x.a };
    for (const bad of [
      { mode: 'transit', durationMin: 2881, note: null },
      { mode: 'transit', durationMin: null, note: 'x'.repeat(501) },
      { mode: 'boat', durationMin: null, note: null },
    ]) {
      await expect(saveLeg(USER, { ...base, ...bad }, txDb())).rejects.toMatchObject({
        code: 'bad_request',
      });
    }
    await expect(
      saveLeg(USER, { target: 'hotel', hotelId: 'x', leg: 'arrival', mode: 'boat' }, txDb()),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('a removed destination is leg_changed, not forbidden', async () => {
    const x = await seedDay();
    await database.delete(places).where(eq(places.id, x.b));
    await expect(
      saveLeg(
        USER,
        { target: 'arrive', dayId: x.dayId, placeId: x.b, after: x.a, mode: 'walk', durationMin: null, note: null },
        txDb(),
      ),
    ).rejects.toMatchObject({ code: 'conflict', message: 'leg_changed' });
  });
});
