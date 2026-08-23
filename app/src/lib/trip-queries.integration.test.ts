// Integration coverage for loadTripsForUser (TP-0032, Bug 2). Gated on
// TEST_DATABASE_URL like every other *.integration.test.ts here — which means
// it SKIPS in CI, where the variable is set nowhere. Run it locally against a
// scratch database before opening the PR; a green CI check does not verify this.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { trips, tripMemberships } from '@/db/schema';
import { loadTripsForUser } from '@/lib/trip-queries';
import type { IdemExecutor } from '@/lib/api/idempotency';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const OWNER = 'tq-owner';
const MEMBER = 'tq-member';
const OWNED = 'tq-trip-owned';
const SHARED = 'tq-trip-shared';
const GONE = 'tq-trip-deleted';

suite('loadTripsForUser', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const exec = () => database as unknown as IdemExecutor;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });

    await client`DELETE FROM trip_membership WHERE user_id IN (${OWNER},${MEMBER})`;
    await client`DELETE FROM trip WHERE id IN (${OWNED},${SHARED},${GONE})`;
    await client`INSERT INTO "user"(id,name,email) VALUES (${OWNER},'O','tq-owner@t.local'),(${MEMBER},'M','tq-member@t.local') ON CONFLICT (id) DO NOTHING`;

    await client`INSERT INTO trip(id,owner_id,title) VALUES
      (${OWNED},${OWNER},'Owned only'),
      (${SHARED},${OWNER},'Shared'),
      (${GONE},${OWNER},'Soft-deleted shared')`;
    await client`UPDATE trip SET deleted_at = now() WHERE id = ${GONE}`;

    // via drizzle: trip_membership.id is generated app-side, not by the DB.
    await database.insert(tripMemberships).values([
      { tripId: SHARED, userId: MEMBER, role: 'editor' },
      { tripId: GONE, userId: MEMBER, role: 'editor' },
    ]);
  });

  afterAll(async () => {
    if (!client) return;
    await client`DELETE FROM trip_membership WHERE user_id IN (${OWNER},${MEMBER})`;
    await database.delete(trips).where(inArray(trips.id, [OWNED, SHARED, GONE]));
    await client.end();
  });

  it('lists the owner’s trips with role=owner', async () => {
    const rows = await loadTripsForUser(OWNER, exec());
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(OWNED)?.role).toBe('owner');
    expect(byId.get(SHARED)?.role).toBe('owner');
  });

  it('lists a shared trip for the member with the membership role', async () => {
    const rows = await loadTripsForUser(MEMBER, exec());
    const shared = rows.find((r) => r.id === SHARED);
    expect(shared).toBeDefined();
    expect(shared?.role).toBe('editor');
  });

  it('does not leak a trip the member is not a member of', async () => {
    const rows = await loadTripsForUser(MEMBER, exec());
    expect(rows.map((r) => r.id)).not.toContain(OWNED);
  });

  it('excludes a soft-deleted trip even when a membership row exists', async () => {
    const rows = await loadTripsForUser(MEMBER, exec());
    expect(rows.map((r) => r.id)).not.toContain(GONE);
  });

  it('lists a trip only once when the user is both owner and member', async () => {
    await database
      .insert(tripMemberships)
      .values({ tripId: OWNED, userId: OWNER, role: 'editor' });
    try {
      const rows = await loadTripsForUser(OWNER, exec());
      expect(rows.filter((r) => r.id === OWNED)).toHaveLength(1);
      expect(rows.find((r) => r.id === OWNED)?.role).toBe('owner');
    } finally {
      await client`DELETE FROM trip_membership WHERE trip_id = ${OWNED} AND user_id = ${OWNER}`;
    }
  });
});
