// Tests for GET/PATCH /api/v1/trips/:tripId status + sourceUrl logic
// (TP-0042/TP-0043). The handlers compose neon-bound loaders (loadApiTrip /
// updateTrip), so — like the sibling sub-route tests — we exercise the route's
// own logic directly: the pure helpers always run, and a DB-gated block seeds
// real place rows (round-tripping the status column) to feed summarizeTripStatus.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, days, places } from '@/db/schema';
import { ServiceError } from '@/lib/services/service-error';
import { readStatusFilter, readTripSourceUrl, summarizeTripStatus } from '@/lib/api/trip-status';

function getReq(query = ''): Request {
  return new Request(`http://t.local/api/v1/trips/t1${query}`);
}

describe('trip route status + sourceUrl helpers (TP-0042/TP-0043)', () => {
  // (b) ?status filter validation
  it('readStatusFilter: absent → null, valid passes, bogus → 400 bad_request', () => {
    expect(readStatusFilter(getReq())).toBeNull();
    expect(readStatusFilter(getReq('?status=tbd'))).toBe('tbd');
    expect(readStatusFilter(getReq('?status=confirmed'))).toBe('confirmed');
    try {
      readStatusFilter(getReq('?status=bogus'));
      throw new Error('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect((e as ServiceError).code).toBe('bad_request');
    }
  });

  // (c) PATCH sourceUrl: scheme validation + clear/untouched semantics
  it('readTripSourceUrl: absent → undefined, null → null (clear), http(s) passes', () => {
    expect(readTripSourceUrl({})).toBeUndefined();
    expect(readTripSourceUrl({ sourceUrl: null })).toBeNull();
    expect(readTripSourceUrl({ sourceUrl: '' })).toBeNull();
    expect(readTripSourceUrl({ sourceUrl: 'https://plan.test/x' })).toBe('https://plan.test/x');
  });

  it('readTripSourceUrl: javascript:/data: → 400 bad_request', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a url']) {
      try {
        readTripSourceUrl({ sourceUrl: bad });
        throw new Error(`expected a throw for ${bad}`);
      } catch (e) {
        expect(e).toBeInstanceOf(ServiceError);
        expect((e as ServiceError).code).toBe('bad_request');
      }
    }
  });

  // (a) tbdCount counts the WHOLE trip; filter narrows the returned places.
  it('summarizeTripStatus: tbdCount is count-before-filter; ?status=tbd returns only tbd', () => {
    const days = [
      { id: 'd0', places: [{ status: 'tbd' }, { status: 'confirmed' }] },
      { id: 'd1', places: [{ status: 'tbd' }] },
    ];
    const tbd = summarizeTripStatus(days, 'tbd');
    expect(tbd.tbdCount).toBe(2); // whole trip
    expect(tbd.days.flatMap((d) => d.places)).toEqual([{ status: 'tbd' }, { status: 'tbd' }]);

    const all = summarizeTripStatus(days, null);
    expect(all.tbdCount).toBe(2); // same count, unfiltered
    expect(all.days.flatMap((d) => d.places)).toHaveLength(3);

    const confirmed = summarizeTripStatus(days, 'confirmed');
    expect(confirmed.tbdCount).toBe(2); // unchanged by the filter
    expect(confirmed.days.flatMap((d) => d.places)).toEqual([{ status: 'confirmed' }]);
  });
});

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
const USER = 'trip-status-u1';

// (a)+(d) against real rows: status persists on the column and round-trips back
// through summarizeTripStatus exactly as GET would surface it.
suite('GET /api/v1/trips/:tripId status projection (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let tripId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    await client`INSERT INTO "user"(id,name,email) VALUES (${USER},'T','trip-status@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database
      .insert(trips)
      .values({ ownerId: USER, title: `trip-status-${Date.now()}` })
      .returning({ id: trips.id });
    tripId = t.id;
    const [d] = await database
      .insert(days)
      .values({ tripId, idx: 0, label: 'Mon', num: 1, date: 'Monday, Jan 1', title: 'Day 1' })
      .returning({ id: days.id });
    await database.insert(places).values([
      { dayId: d.id, idx: 0, kind: 'sight', name: 'TBD A', status: 'tbd', sourceUrl: 'https://src.test/a' },
      { dayId: d.id, idx: 1, kind: 'food', name: 'Confirmed B' }, // status defaults
      { dayId: d.id, idx: 2, kind: 'sight', name: 'TBD C', status: 'tbd' },
    ]);
  });

  afterAll(async () => {
    await client?.end();
  });

  it('persists status (default confirmed) + sourceUrl, and projects them like GET', async () => {
    const rows = await database
      .select()
      .from(places)
      .where(eq(places.dayId, (await database.select({ id: days.id }).from(days).where(eq(days.tripId, tripId)).limit(1))[0].id))
      .orderBy(asc(places.idx));
    // (d) status round-trips from the column; the omitted one defaulted.
    expect(rows.map((p) => p.status)).toEqual(['tbd', 'confirmed', 'tbd']);
    expect(rows[0].sourceUrl).toBe('https://src.test/a');
    expect(rows[1].sourceUrl).toBeNull();

    const apiDays = [{ id: 'd0', places: rows }];
    // (a) whole-trip count + filtered view, exactly as the GET handler computes.
    const tbd = summarizeTripStatus(apiDays, 'tbd');
    expect(tbd.tbdCount).toBe(2);
    expect(tbd.days[0].places.map((p) => p.name)).toEqual(['TBD A', 'TBD C']);
    expect(summarizeTripStatus(apiDays, null).days[0].places).toHaveLength(3);
  });
});
