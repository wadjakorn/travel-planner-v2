// [API-MEM] members + invites services against Postgres. Gated on TEST_DATABASE_URL.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { invites, trips } from '@/db/schema';
import type { IdemExecutor } from '@/lib/api/idempotency';

vi.mock('@/lib/audit', () => ({ writeAudit: async () => {} }));

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;
const OWNER = 'mem-owner';
const EDITOR = 'mem-editor';
const VIEWER = 'mem-viewer';
const STRANGER = 'mem-stranger';

suite('members + invites services ([API-MEM])', () => {
  let client: ReturnType<typeof postgres>;
  let database: ReturnType<typeof drizzle<typeof schema>>;
  let svc: typeof import('./invite-service');
  let tripId: string;
  const exec = () => database as unknown as IdemExecutor;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= URL;
    client = postgres(URL as string, { prepare: false });
    database = drizzle(client, { schema });
    svc = await import('./invite-service');
    await client`INSERT INTO "user"(id,name,email) VALUES
      (${OWNER},'Owner O','mem-owner@t.local'),(${EDITOR},'Ed','mem-ed@t.local'),
      (${VIEWER},'Vi','mem-vi@t.local'),(${STRANGER},'St','mem-st@t.local') ON CONFLICT (id) DO NOTHING`;
    const [t] = await database.insert(trips).values({ ownerId: OWNER, title: `mem-${Date.now()}` }).returning({ id: trips.id });
    tripId = t.id;
    await database.insert(schema.tripMemberships).values([
      { tripId, userId: EDITOR, role: 'editor' },
      { tripId, userId: VIEWER, role: 'viewer' },
    ]);
  });
  afterAll(async () => {
    if (tripId) await database.delete(trips).where(eq(trips.id, tripId));
    await client?.end();
  });

  it('members: owner + rows, readable by a viewer, hidden from a stranger', async () => {
    const out = await svc.listMembers(VIEWER, tripId, exec());
    expect(out.owner?.userId).toBe(OWNER);
    expect(out.members.map((m) => [m.userId, m.role]).sort()).toEqual([[EDITOR, 'editor'], [VIEWER, 'viewer']]);
    await expect(svc.listMembers(STRANGER, tripId, exec())).rejects.toMatchObject({ code: expect.stringMatching(/not_found|forbidden/) });
  });

  it('owner creates (hash stored, token returned once), lists and revokes', async () => {
    const { invite, token } = await svc.createInvite(OWNER, tripId, { email: ' New@T.local ', role: 'viewer' }, exec());
    expect(invite).toMatchObject({ email: 'new@t.local', role: 'viewer' });
    const [row] = await database.select().from(invites).where(eq(invites.id, invite.id));
    expect(row.tokenHash).toBe(await svc.hashInviteToken(token));
    expect(row.tokenHash).not.toContain(token);
    expect((await svc.listInvites(OWNER, tripId, exec())).map((i) => i.id)).toContain(invite.id);
    expect(await svc.revokeInvite(OWNER, invite.id, exec())).toEqual({ tripId });
    const [after] = await database.select({ s: invites.status }).from(invites).where(eq(invites.id, invite.id));
    expect(after.s).toBe('revoked');
  });

  it('only the owner manages invites; bad input is a 400', async () => {
    await expect(svc.createInvite(EDITOR, tripId, { email: 'x@t.local' }, exec())).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.listInvites(VIEWER, tripId, exec())).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.createInvite(OWNER, tripId, { email: 'nope' }, exec())).rejects.toMatchObject({ code: 'bad_request' });
    await expect(svc.createInvite(OWNER, tripId, { email: 'a@b.c', role: 'owner' }, exec())).rejects.toMatchObject({ code: 'bad_request' });
    const { invite } = await svc.createInvite(OWNER, tripId, { email: 'keep@t.local' }, exec());
    await expect(svc.revokeInvite(EDITOR, invite.id, exec())).rejects.toMatchObject({ code: 'not_found' });
    await expect(svc.revokeInvite(OWNER, 'no-such', exec())).rejects.toMatchObject({ code: 'not_found' });
  });
});
