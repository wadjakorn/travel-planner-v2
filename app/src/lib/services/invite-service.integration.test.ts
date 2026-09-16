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
import {
  acceptInvite,
  hashInviteToken,
  regenerateInviteToken,
} from '@/lib/services/invite-service';
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

suite('regenerateInviteToken', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  const exec = () => database as unknown as IdemExecutor;

  const seedInvite = async (
    status = 'pending',
    expires = "now() + interval '7 days'",
  ) => {
    await client`DELETE FROM trip_membership WHERE trip_id = ${TRIP}`;
    await client`DELETE FROM invite WHERE trip_id = ${TRIP}`;
    const hash = await hashInviteToken(TOKEN);
    await client.unsafe(
      `INSERT INTO invite(id,trip_id,email,role,token_hash,status,invited_by,expires_at)
       VALUES ($1,$2,$3,'editor',$4,$5,$6, ${expires})`,
      [INVITE_ID, TRIP, INVITED_EMAIL, hash, status, OWNER],
    );
  };

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });

    await client`DELETE FROM invite WHERE trip_id = ${TRIP}`;
    await client`DELETE FROM trip WHERE id = ${TRIP}`;
    await client`INSERT INTO "user"(id,name,email) VALUES
      (${OWNER},'O','inv-owner@t.local'),
      (${INVITEE},'I',${INVITED_EMAIL})
      ON CONFLICT (id) DO NOTHING`;
    await client`INSERT INTO trip(id,owner_id,title) VALUES (${TRIP},${OWNER},'Invite target')`;
  });

  afterAll(async () => {
    if (!client) return;
    await client`DELETE FROM trip_membership WHERE trip_id = ${TRIP}`;
    await client`DELETE FROM invite WHERE trip_id = ${TRIP}`;
    await client`DELETE FROM trip WHERE id = ${TRIP}`;
    await client.end();
  });

  it('kills the old link and issues a working one', async () => {
    await seedInvite();
    const result = await regenerateInviteToken({ inviteId: INVITE_ID }, exec());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token).not.toBe(TOKEN);

    // The link already sent out must stop working the moment a new one exists,
    // otherwise re-issuing would quietly widen access instead of replacing it.
    expect(
      await acceptInvite(
        { userId: INVITEE, email: INVITED_EMAIL, token: TOKEN },
        exec(),
      ),
    ).toEqual({ ok: false, reason: 'invalid' });

    expect(
      await acceptInvite(
        { userId: INVITEE, email: INVITED_EMAIL, token: result.token },
        exec(),
      ),
    ).toEqual({ ok: true, tripId: TRIP });

    const members =
      await client`SELECT user_id FROM trip_membership WHERE trip_id = ${TRIP}`;
    expect(members).toHaveLength(1);
  });

  it('revives an expired invite by resetting expires_at too', async () => {
    await seedInvite('pending', "now() - interval '1 day'");
    const result = await regenerateInviteToken({ inviteId: INVITE_ID }, exec());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] =
      await client`SELECT expires_at FROM invite WHERE id = ${INVITE_ID}`;
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());

    // The whole point of the feature: a fresh token on a stale deadline would
    // be dead on arrival.
    expect(
      await acceptInvite(
        { userId: INVITEE, email: INVITED_EMAIL, token: result.token },
        exec(),
      ),
    ).toEqual({ ok: true, tripId: TRIP });
  });

  it.each(['revoked', 'accepted'])(
    'refuses a %s invite and writes nothing',
    async (status) => {
      await seedInvite(status);
      const before =
        await client`SELECT token_hash, expires_at FROM invite WHERE id = ${INVITE_ID}`;

      expect(
        await regenerateInviteToken({ inviteId: INVITE_ID }, exec()),
      ).toEqual({ ok: false, reason: 'unavailable' });

      const after =
        await client`SELECT token_hash, expires_at FROM invite WHERE id = ${INVITE_ID}`;
      expect(after[0].token_hash).toBe(before[0].token_hash);
      expect(after[0].expires_at).toEqual(before[0].expires_at);
    },
  );

  it('reports a missing invite instead of throwing', async () => {
    expect(
      await regenerateInviteToken({ inviteId: 'no-such-invite' }, exec()),
    ).toEqual({ ok: false, reason: 'not-found' });
  });
});
