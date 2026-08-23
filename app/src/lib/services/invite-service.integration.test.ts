// Integration coverage for the exact-email rule on accept (TP-0032 §3.8).
// Gated on TEST_DATABASE_URL, so it SKIPS in CI — run it locally against a
// scratch database before opening the PR.
//
// Both halves matter: a mismatch must write NEITHER the membership row NOR the
// status flip. A half-applied accept is the failure mode that actually costs
// something, so each test asserts both.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { acceptInvite, hashInviteToken } from '@/lib/services/invite-service';
import type { IdemExecutor } from '@/lib/api/idempotency';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const OWNER = 'inv-owner';
const INVITEE = 'inv-invitee';
const STRANGER = 'inv-stranger';
const TRIP = 'inv-trip';
const INVITED_EMAIL = 'invited@t.local';
const TOKEN = 'inv-token-plaintext';
const INVITE_ID = 'inv-row';

suite('acceptInvite — exact email match', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const exec = () => database as unknown as IdemExecutor;

  const cleanupInvite = async () => {
    await client`DELETE FROM trip_membership WHERE trip_id = ${TRIP}`;
    await client`DELETE FROM invite WHERE trip_id = ${TRIP}`;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });

    await cleanupInvite();
    await client`DELETE FROM trip WHERE id = ${TRIP}`;
    await client`INSERT INTO "user"(id,name,email) VALUES
      (${OWNER},'O','inv-owner@t.local'),
      (${INVITEE},'I',${INVITED_EMAIL}),
      (${STRANGER},'S','stranger@t.local')
      ON CONFLICT (id) DO NOTHING`;
    await client`INSERT INTO trip(id,owner_id,title) VALUES (${TRIP},${OWNER},'Invite target')`;
  });

  beforeEach(async () => {
    await cleanupInvite();
    const hash = await hashInviteToken(TOKEN);
    await client`INSERT INTO invite(id,trip_id,email,role,token_hash,invited_by,expires_at)
      VALUES (${INVITE_ID},${TRIP},${INVITED_EMAIL},'editor',${hash},${OWNER}, now() + interval '7 days')`;
  });

  afterAll(async () => {
    if (!client) return;
    await cleanupInvite();
    await client`DELETE FROM trip WHERE id = ${TRIP}`;
    await client.end();
  });

  const state = async () => {
    const members =
      await client`SELECT user_id, role FROM trip_membership WHERE trip_id = ${TRIP}`;
    const [inv] =
      await client`SELECT status, accepted_at FROM invite WHERE trip_id = ${TRIP}`;
    return { members, inv };
  };

  it('joins the trip when the address matches exactly', async () => {
    const result = await acceptInvite(
      { userId: INVITEE, email: INVITED_EMAIL, token: TOKEN },
      exec(),
    );
    expect(result).toEqual({ ok: true, tripId: TRIP });

    const { members, inv } = await state();
    expect(members).toHaveLength(1);
    expect(members[0].user_id).toBe(INVITEE);
    expect(members[0].role).toBe('editor');
    expect(inv.status).toBe('accepted');
    expect(inv.accepted_at).not.toBeNull();
  });

  it('matches case-insensitively after normalisation', async () => {
    const result = await acceptInvite(
      { userId: INVITEE, email: '  INVITED@T.LOCAL ', token: TOKEN },
      exec(),
    );
    expect(result).toEqual({ ok: true, tripId: TRIP });
    expect((await state()).inv.status).toBe('accepted');
  });

  it('writes nothing at all when a different address accepts', async () => {
    const result = await acceptInvite(
      { userId: STRANGER, email: 'stranger@t.local', token: TOKEN },
      exec(),
    );
    expect(result).toEqual({ ok: false, reason: 'wrong-email' });

    const { members, inv } = await state();
    expect(members).toHaveLength(0);
    expect(inv.status).toBe('pending');
    expect(inv.accepted_at).toBeNull();
  });

  it('writes nothing when the session has no email at all', async () => {
    const result = await acceptInvite(
      { userId: STRANGER, email: null, token: TOKEN },
      exec(),
    );
    expect(result).toEqual({ ok: false, reason: 'wrong-email' });

    const { members, inv } = await state();
    expect(members).toHaveLength(0);
    expect(inv.status).toBe('pending');
  });
});
