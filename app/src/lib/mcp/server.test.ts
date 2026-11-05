// MCP tool contract tests (TP-0035): in-memory client ↔ server, services faked.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {}, dbNode: {} }));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { NextResponse } from 'next/server';
import { buildMcpServer, type McpDeps } from './server';
import { ServiceError } from '@/lib/services/service-error';

const at = new Date('2026-11-06T01:02:03.004Z');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = ReturnType<typeof vi.fn<(...a: any[]) => any>>;
type Fakes = { [K in keyof McpDeps]: Fn };
function fakeDeps(): Fakes {
  return {
    importTripIdempotent: vi.fn(async (_u, _r, _b, _d, dryRun) =>
      NextResponse.json({ trip: { id: dryRun ? null : 'new', title: 'T', days: [{ places: [{}] }], hotels: [] }, warnings: [], summary: {} }, { status: dryRun ? 200 : 201 }),
    ),
    putTripPlan: vi.fn(async (_u, _t, _r, body: Record<string, unknown>) =>
      NextResponse.json({ trip: body.dryRun ? null : { id: 't1', title: 'T', days: [] }, diff: { places: { moved: [{ id: 'p1' }] } }, warnings: [], summary: {} }),
    ),
    loadApiTrip: vi.fn(async () => ({ id: 't1', title: 'Japan', days: [], hotels: [] })),
    loadTripsForUser: vi.fn(async () => [{ id: 't1', title: 'Japan' }]),
    requireTripAccess: vi.fn(async () => 'owner'),
    tripUpdatedAt: vi.fn(async () => at),
    searchPlacesForApi: vi.fn(async () => NextResponse.json([{ name: 'X' }])),
    setPlaceArrive: vi.fn(async () => ({ tripId: 't1', arrive: null })),
    patchHotel: vi.fn(async () => ({ hotel: { id: 'h1' }, warnings: [] })),
    createHotelIdempotent: vi.fn(async () => NextResponse.json({ hotel: { id: 'h2' }, warnings: [] }, { status: 201 })),
    removeHotel: vi.fn(async () => ({ tripId: 't1' })),
    secret: vi.fn(() => 'test-secret'),
  } as never;
}

async function connect(scope = 'read-write', deps = fakeDeps()) {
  const server = buildMcpServer({ userId: 'u1', scope }, deps as unknown as McpDeps);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent?: Record<string, unknown>; content: { text: string }[] };
  return { client, call, deps };
}

describe('MCP server (TP-0035)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the v1 tools with annotations, plus the resource template and prompts', async () => {
    const { client } = await connect();
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['apply_plan_update', 'create_trip', 'delete_hotel', 'get_trip', 'list_trips', 'preview_plan_update', 'preview_trip', 'save_hotel', 'search_places', 'set_leg'].sort(),
    );
    expect(tools.find((t) => t.name === 'create_trip')?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === 'get_trip')?.annotations?.readOnlyHint).toBe(true);
    expect((await client.listResourceTemplates()).resourceTemplates[0].uriTemplate).toBe('trip://{tripId}');
    expect((await client.listPrompts()).prompts.map((p) => p.name).sort()).toEqual(['edit_trip', 'plan_trip']);
  });

  it('get_trip checks read access first (B1) and returns a readable summary', async () => {
    const { call, deps } = await connect();
    const r = await call('get_trip', { tripId: 't1' });
    expect(deps.requireTripAccess).toHaveBeenCalledWith('u1', 't1', 'read');
    expect(r.content[0].text).toContain('# Japan');
    deps.requireTripAccess.mockRejectedValueOnce(new ServiceError('not_found', 'Trip not found'));
    const denied = await call('get_trip', { tripId: 'other' });
    expect(denied.isError).toBe(true);
    expect(deps.loadApiTrip).toHaveBeenCalledTimes(1);
  });

  it('create_trip needs the preview token of the same plan; retries reuse one idempotency key', async () => {
    const { call, deps } = await connect();
    const plan = { trip: { title: 'T' }, days: [{ places: [{ kind: 'sight', name: 'A', lat: 1, lng: 2 }] }] };
    expect((await call('create_trip', { plan, confirmToken: 'nope' })).isError).toBe(true);
    const prev = await call('preview_trip', { plan });
    const token = prev.structuredContent!.confirmToken as string;
    expect(deps.importTripIdempotent.mock.calls[0][4]).toBe(true);
    const other = await call('create_trip', { plan: { ...plan, trip: { title: 'Other' } }, confirmToken: token });
    expect(other.content[0].text).toMatch(/plan changed since the preview/);
    const reordered = { days: plan.days, trip: plan.trip };
    const made = await call('create_trip', { plan: reordered, confirmToken: token });
    expect(made.isError).toBeFalsy();
    expect(made.structuredContent!.differsFromPreview).toBe(false);
    await call('create_trip', { plan, confirmToken: token });
    const keys = deps.importTripIdempotent.mock.calls.slice(1).map((c: unknown[]) => (c[1] as Request).headers.get('idempotency-key'));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('plan update: preview injects ifUpdatedAt = the version read first; apply sends it from the token', async () => {
    const { call, deps } = await connect();
    const plan = { days: [{ id: 'd1', places: [{ id: 'p2' }, { id: 'p1' }] }] };
    const prev = await call('preview_plan_update', { tripId: 't1', plan });
    expect(deps.putTripPlan.mock.calls[0][3]).toMatchObject({ dryRun: true, ifUpdatedAt: at.toISOString() });
    const token = prev.structuredContent!.confirmToken as string;
    await call('apply_plan_update', { tripId: 't1', plan, confirmToken: token });
    const body = deps.putTripPlan.mock.calls[1][3] as Record<string, unknown>;
    expect(body.ifUpdatedAt).toBe(at.toISOString());
    expect(body.dryRun).toBeUndefined();
    expect((await call('apply_plan_update', { tripId: 't2', plan, confirmToken: token })).isError).toBe(true);
    const stale = await call('preview_plan_update', { tripId: 't1', plan: { ...plan, ifUpdatedAt: '2000-01-01T00:00:00.000Z' } });
    expect(stale.structuredContent!.reason).toBe('version_mismatch');
  });

  it('preview_plan_update checks write access before reading the trip version', async () => {
    const { call, deps } = await connect();
    deps.requireTripAccess.mockRejectedValueOnce(new ServiceError('not_found', 'Trip not found'));
    const r = await call('preview_plan_update', { tripId: 'foreign', plan: { days: [], ifUpdatedAt: '1970-01-01T00:00:00.000Z' } });
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.updatedAt).toBeUndefined();
    expect(deps.tripUpdatedAt).not.toHaveBeenCalled();
  });

  it('a read-only token can read and preview but not write', async () => {
    const { call, deps } = await connect('read');
    expect((await call('list_trips')).isError).toBeFalsy();
    const w = await call('set_leg', { placeId: 'p1', arrive: null });
    expect(w.isError).toBe(true);
    expect(w.structuredContent!.reason).toBe('read_only_token');
    expect(deps.setPlaceArrive).not.toHaveBeenCalled();
  });

  it('delete_hotel needs confirm: true; save_hotel creates with the requestId as idempotency key', async () => {
    const { call, deps } = await connect();
    expect((await call('delete_hotel', { hotelId: 'h1', confirm: false })).structuredContent!.reason).toBe('confirm_required');
    expect(deps.removeHotel).not.toHaveBeenCalled();
    await call('delete_hotel', { hotelId: 'h1', confirm: true });
    expect(deps.removeHotel).toHaveBeenCalledWith('u1', 'h1');
    const rid = '0f8fad5b-d9cb-469f-a165-70867728950e';
    await call('save_hotel', { tripId: 't1', hotel: { status: 'tbd', area: 'Namba' }, requestId: rid });
    expect(deps.createHotelIdempotent).toHaveBeenCalledWith('u1', 't1', { status: 'tbd', area: 'Namba' }, rid);
    await call('save_hotel', { hotel: { id: 'h1', checkOutDate: '2026-12-04' } });
    expect(deps.patchHotel).toHaveBeenCalledWith('u1', 'h1', { checkOutDate: '2026-12-04' });
  });

  it('a REST error response becomes isError (M6)', async () => {
    const deps = fakeDeps();
    deps.searchPlacesForApi.mockResolvedValueOnce(NextResponse.json({ error: 'rate_limited', message: 'Daily limit' }, { status: 429 }));
    const { call } = await connect('read-write', deps);
    const r = await call('search_places', { query: 'x', near: { lat: 1, lng: 2 } });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/rate_limited: Daily limit/);
  });
});
