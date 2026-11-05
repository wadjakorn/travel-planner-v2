// MCP server v1 (TP-0035, design v2). Built per request (stateless Streamable
// HTTP), with the PAT's user + scope bound into every tool. Tools are thin
// wrappers over the REST services; bulk writes need a confirmToken from the
// matching preview tool (it proves a preview of exactly this plan happened).

import 'server-only';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { ServiceError } from '@/lib/services/service-error';
import { requireTripAccess } from '@/lib/services/access';
import { loadApiTrip, loadTripsForUser } from '@/lib/trip-queries';
import { importTripIdempotent } from '@/lib/api/import-orchestrator';
import { putTripPlan } from '@/lib/api/plan-update-orchestrator';
import { searchPlacesForApi } from '@/lib/api/places-search';
import { setPlaceArrive } from '@/lib/services/leg-service';
import { parseArrive } from '@/lib/api/arrive-input';
import { patchHotel, prepareHotelCreate } from '@/lib/api/hotel-link';
import { createHotel, removeHotel } from '@/lib/services/booking-service';
import { withIdempotencyAtomic } from '@/lib/api/idempotency-atomic';
import {
  canonicalize,
  mintConfirmToken,
  planHash,
  previewDigest,
  sha256,
  verifyConfirmToken,
} from './confirm-token';
import { tripSummary, type SummaryTrip } from './trip-summary';

export type McpContext = { userId: string; scope: string };

// Injected in tests; production uses the real modules.
export type McpDeps = {
  importTripIdempotent: typeof importTripIdempotent;
  putTripPlan: typeof putTripPlan;
  loadApiTrip: typeof loadApiTrip;
  loadTripsForUser: typeof loadTripsForUser;
  requireTripAccess: typeof requireTripAccess;
  tripUpdatedAt: (tripId: string) => Promise<Date | null>;
  searchPlacesForApi: typeof searchPlacesForApi;
  setPlaceArrive: typeof setPlaceArrive;
  patchHotel: typeof patchHotel;
  createHotelIdempotent: (userId: string, tripId: string, body: Record<string, unknown>, requestId?: string) => Promise<Response>;
  removeHotel: typeof removeHotel;
  secret: () => string | undefined;
};

const MCP_URL = 'https://mcp.local/api/mcp';
const internalReq = (idempotencyKey?: string) =>
  new Request(MCP_URL, { method: 'POST', headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {} });

export const defaultMcpDeps: McpDeps = {
  importTripIdempotent,
  putTripPlan,
  loadApiTrip,
  loadTripsForUser,
  requireTripAccess,
  tripUpdatedAt: async (tripId) => {
    const [r] = await db
      .select({ u: trips.updatedAt })
      .from(trips)
      .where(and(eq(trips.id, tripId), isNull(trips.deletedAt)))
      .limit(1);
    return r?.u ?? null;
  },
  searchPlacesForApi,
  setPlaceArrive,
  patchHotel,
  createHotelIdempotent: async (userId, tripId, body, requestId) => {
    const prep = await prepareHotelCreate(userId, body);
    return withIdempotencyAtomic(userId, internalReq(requestId), body, async (tx) => ({
      status: 201,
      body: { hotel: await createHotel(userId, tripId, prep.body, tx, prep.server), warnings: prep.warnings },
    }));
  },
  removeHotel,
  secret: () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || undefined,
};

type ToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const ok = (data: Record<string, unknown>, text?: string): ToolResult => ({
  content: [{ type: 'text', text: text ?? JSON.stringify(data, null, 2) }],
  structuredContent: data,
});
const fail = (message: string, extra: Record<string, unknown> = {}): ToolResult => ({
  content: [{ type: 'text', text: message }],
  structuredContent: { error: true, message, ...extra },
  isError: true,
});

/** REST response → tool result: status ≥ 400 is an error (M6). */
async function fromResponse(res: Response): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; result: ToolResult }> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  if (res.status >= 400) {
    const { error, message, ...rest } = body as { error?: string; message?: string };
    return { ok: false, result: fail(`${error ?? res.status}: ${message ?? 'request failed'}`, { status: res.status, ...rest }) };
  }
  return { ok: true, body };
}

async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServiceError) return fail(`${e.code}: ${e.message}`, { code: e.code, ...e.extra });
    console.error('[mcp] tool failed', e);
    return fail('internal error');
  }
}

const omit = (o: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

const warningCodes = (ws: unknown): string[] =>
  Array.isArray(ws) ? ws.flatMap((w) => ((w as { codes?: string[]; code?: string }).codes ?? [(w as { code?: string }).code ?? ''])) : [];

const nearSchema = z.union([z.string(), z.object({ lat: z.number(), lng: z.number() })]);
const planSchema = z.record(z.string(), z.unknown());

export function buildMcpServer(ctx: McpContext, deps: McpDeps = defaultMcpDeps): McpServer {
  const server = new McpServer({ name: 'travel-planner', version: '1.0.0' });
  const canWrite = ctx.scope === 'read-write';
  const needWrite = () =>
    canWrite ? null : fail('This token is read-only; create a read-write token to change trips.', { reason: 'read_only_token' });
  const secret = () => {
    const s = deps.secret();
    if (!s) throw new ServiceError('internal', 'Server not configured for confirm tokens');
    return s;
  };

  const readTrip = async (tripId: string) => {
    await deps.requireTripAccess(ctx.userId, tripId, 'read'); // B1: loadApiTrip has no authz
    const trip = await deps.loadApiTrip(tripId);
    if (!trip) throw new ServiceError('not_found', 'Trip not found');
    return trip;
  };

  server.registerTool(
    'list_trips',
    {
      title: 'List trips',
      description: 'List the trips you can see (owned or shared), newest first, with id, title, dates and updatedAt.',
      annotations: { readOnlyHint: true },
    },
    () =>
      guard(async () => {
        const rows = await deps.loadTripsForUser(ctx.userId);
        const list = rows.map((t) => {
          const r = t as unknown as Record<string, unknown>;
          return { id: r.id, title: r.title, startDate: r.startDate ?? null, endDate: r.endDate ?? null, updatedAt: r.updatedAt ?? null };
        });
        return ok({ trips: list }, list.map((t) => `- ${t.title} (${t.id})`).join('\n') || 'No trips yet.');
      }),
  );

  server.registerTool(
    'get_trip',
    {
      title: 'Get a trip',
      description:
        'A trip in full (days → places with arrive legs + est distance/time, hotels) plus a readable per-day summary. Note its updatedAt and ids before editing.',
      inputSchema: { tripId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ tripId }) =>
      guard(async () => {
        const trip = await readTrip(tripId);
        return ok({ trip } as Record<string, unknown>, tripSummary(trip as unknown as SummaryTrip));
      }),
  );

  server.registerTool(
    'search_places',
    {
      title: 'Search places',
      description:
        'Find real places by name (Google Places). Use the result lat/lng (or placeId) in plans instead of guessing coordinates. Counts against a daily per-user quota; call it in parallel for several names.',
      inputSchema: { query: z.string().min(1), near: nearSchema.optional(), radius: z.number().positive().optional() },
      annotations: { readOnlyHint: true },
    },
    ({ query, near, radius }) =>
      guard(async () => {
        let n: { lat: number; lng: number } | null = null;
        if (typeof near === 'string') {
          const [lat, lng] = near.split(',').map((x) => Number(x.trim()));
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail('"near" must be "lat,lng" or {lat,lng}');
          n = { lat, lng };
        } else if (near) n = near;
        const r = await fromResponse(await deps.searchPlacesForApi(ctx.userId, query.trim(), n, radius ?? null));
        return r.ok ? ok({ results: r.body as unknown as Record<string, unknown> }) : r.result;
      }),
  );

  server.registerTool(
    'preview_trip',
    {
      title: 'Preview a new trip',
      description:
        'Dry run of creating a trip from an import-shaped plan ({ trip, days[{date?, places[]}], hotels[], transport[], expenses[], notes[], budget }). Writes nothing. Show the user the preview and warnings, then call create_trip with the SAME plan and the returned confirmToken.',
      inputSchema: { plan: planSchema },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ plan }) =>
      guard(async () => {
        const canon = canonicalize(omit(plan, ['dryRun'])) as Record<string, unknown>;
        const r = await fromResponse(await deps.importTripIdempotent(ctx.userId, internalReq(), canon, undefined, true));
        if (!r.ok) return r.result;
        const preview = r.body as { trip?: { days?: { places?: unknown[] }[]; hotels?: unknown[] }; warnings?: unknown; summary?: unknown };
        const days = preview.trip?.days ?? [];
        const counts = { days: days.length, places: days.reduce((s, d) => s + (d.places?.length ?? 0), 0), hotels: preview.trip?.hotels?.length ?? 0 };
        const confirmToken = mintConfirmToken(
          { u: ctx.userId, k: 'create_trip', h: planHash(canon), d: previewDigest(counts, warningCodes(preview.warnings)) },
          secret(),
        );
        return ok({ ...preview, counts, confirmToken });
      }),
  );

  server.registerTool(
    'create_trip',
    {
      title: 'Create the previewed trip',
      description:
        'Create the trip shown by preview_trip. Needs the confirmToken from preview_trip and the identical plan; ask the user before calling. Safe to retry with the same token.',
      inputSchema: { plan: planSchema, confirmToken: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ plan, confirmToken }) =>
      guard(async () => {
        const denied = needWrite();
        if (denied) return denied;
        const canon = canonicalize(omit(plan, ['dryRun'])) as Record<string, unknown>;
        const v = verifyConfirmToken(confirmToken, { u: ctx.userId, k: 'create_trip', h: planHash(canon) }, secret());
        if (!v.ok) return fail(`confirmToken rejected: ${v.reason}. Call preview_trip again with this plan.`, { reason: 'confirm_token' });
        const r = await fromResponse(
          await deps.importTripIdempotent(ctx.userId, internalReq(sha256(confirmToken)), canon, undefined, false),
        );
        if (!r.ok) return r.result;
        const out = r.body as { trip?: { days?: { places?: unknown[] }[]; hotels?: unknown[]; id?: string }; warnings?: unknown };
        const days = out.trip?.days ?? [];
        const counts = { days: days.length, places: days.reduce((s, d) => s + (d.places?.length ?? 0), 0), hotels: out.trip?.hotels?.length ?? 0 };
        const differsFromPreview = previewDigest(counts, warningCodes(out.warnings)) !== v.payload.d;
        const text = out.trip ? tripSummary(out.trip as unknown as SummaryTrip) : 'Created.';
        return ok({ ...r.body, differsFromPreview }, differsFromPreview ? `${text}\n\nNote: the result differs from the preview (re-resolved places).` : text);
      }),
  );

  server.registerTool(
    'preview_plan_update',
    {
      title: 'Preview a trip edit',
      description:
        'Dry run of PUT /trips/:id/plan: plan = { days: [every existing day id in order, each { id, title?, defaultMode?, places?: [{ id } keep/move | { id, ...fields } edit | { ...fields } new] }], prune? }. Returns the diff (created/updated/moved/deleted places, legs) and a confirmToken. Show the user the diff, then call apply_plan_update with the SAME plan.',
      inputSchema: { tripId: z.string(), plan: planSchema },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ tripId, plan }) =>
      guard(async () => {
        // Access first: the version read below must not reveal a foreign
        // trip's existence or updatedAt (review). PUT /plan needs write too.
        await deps.requireTripAccess(ctx.userId, tripId, 'write');
        const at = await deps.tripUpdatedAt(tripId); // M4: read the version first
        if (!at) return fail('Trip not found', { reason: 'not_found' });
        if (typeof plan.ifUpdatedAt === 'string' && new Date(plan.ifUpdatedAt).getTime() !== at.getTime()) {
          return fail('The trip changed since you read it; call get_trip again.', { reason: 'version_mismatch', updatedAt: at.toISOString() });
        }
        const canon = canonicalize(omit(plan, ['dryRun', 'ifUpdatedAt'])) as Record<string, unknown>;
        const res = await deps.putTripPlan(ctx.userId, tripId, internalReq(), { ...canon, ifUpdatedAt: at.toISOString(), dryRun: true });
        const r = await fromResponse(res);
        if (!r.ok) return r.result;
        const { diff, warnings, summary } = r.body as { diff: Record<string, Record<string, unknown[]>>; warnings: unknown; summary: unknown };
        const counts = Object.fromEntries(
          Object.entries(diff ?? {}).flatMap(([sec, kinds]) => Object.entries(kinds).map(([k, list]) => [`${sec}.${k}`, list.length])),
        );
        const confirmToken = mintConfirmToken(
          { u: ctx.userId, k: 'apply_plan_update', t: tripId, h: planHash(canon), at: at.toISOString(), d: previewDigest(counts, warningCodes(warnings)) },
          secret(),
        );
        return ok({ diff, warnings, summary, counts, updatedAt: at.toISOString(), confirmToken });
      }),
  );

  server.registerTool(
    'apply_plan_update',
    {
      title: 'Apply the previewed trip edit',
      description:
        'Apply the edit shown by preview_plan_update. Needs its confirmToken and the identical plan; ask the user before calling. Fails if the trip changed since the preview (preview again). Safe to retry with the same token.',
      inputSchema: { tripId: z.string(), plan: planSchema, confirmToken: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ tripId, plan, confirmToken }) =>
      guard(async () => {
        const denied = needWrite();
        if (denied) return denied;
        const canon = canonicalize(omit(plan, ['dryRun', 'ifUpdatedAt'])) as Record<string, unknown>;
        const v = verifyConfirmToken(confirmToken, { u: ctx.userId, k: 'apply_plan_update', t: tripId, h: planHash(canon) }, secret());
        if (!v.ok) return fail(`confirmToken rejected: ${v.reason}. Call preview_plan_update again with this plan.`, { reason: 'confirm_token' });
        const res = await deps.putTripPlan(ctx.userId, tripId, internalReq(sha256(confirmToken)), { ...canon, ifUpdatedAt: v.payload.at });
        const r = await fromResponse(res);
        if (!r.ok) return r.result;
        const { diff, warnings, trip } = r.body as { diff: Record<string, Record<string, unknown[]>>; warnings: unknown; trip?: unknown };
        const counts = Object.fromEntries(
          Object.entries(diff ?? {}).flatMap(([sec, kinds]) => Object.entries(kinds).map(([k, list]) => [`${sec}.${k}`, list.length])),
        );
        const differsFromPreview = previewDigest(counts, warningCodes(warnings)) !== v.payload.d;
        const text = trip ? tripSummary(trip as SummaryTrip) : 'Applied.';
        return ok({ ...r.body, differsFromPreview }, text);
      }),
  );

  server.registerTool(
    'set_leg',
    {
      title: 'Set the leg into a place',
      description:
        'Set (or clear with arrive: null) how you travel INTO a place: { mode: drive|walk|transit, durationMin?, note? }. On the first stop of a day it is the leg from the hotel.',
      inputSchema: {
        placeId: z.string(),
        arrive: z.object({ mode: z.enum(['drive', 'walk', 'transit']), durationMin: z.number().int().nullable().optional(), note: z.string().nullable().optional() }).nullable(),
      },
      annotations: { idempotentHint: true },
    },
    ({ placeId, arrive }) =>
      guard(async () => {
        const denied = needWrite();
        if (denied) return denied;
        const input = arrive === null ? null : parseArrive(arrive);
        const out = await deps.setPlaceArrive(ctx.userId, placeId, input);
        return ok(out as unknown as Record<string, unknown>);
      }),
  );

  server.registerTool(
    'save_hotel',
    {
      title: 'Create or update a hotel',
      description:
        'With hotel.id: patch only the fields you send. Without: create in tripId. A not-yet-booked hotel is { status: "tbd", area: "Namba" }; pin it with area, query, googleMapsUrl or lat/lng. For a create, pass a requestId (any UUID) and reuse it if you retry, so the hotel is not created twice.',
      inputSchema: { tripId: z.string().optional(), hotel: planSchema, requestId: z.string().uuid().optional() },
    },
    ({ tripId, hotel, requestId }) =>
      guard(async () => {
        const denied = needWrite();
        if (denied) return denied;
        if (typeof hotel.id === 'string') {
          const out = await deps.patchHotel(ctx.userId, hotel.id, omit(hotel, ['id']));
          return ok(out as unknown as Record<string, unknown>);
        }
        if (!tripId) return fail('tripId is required to create a hotel');
        const r = await fromResponse(await deps.createHotelIdempotent(ctx.userId, tripId, hotel, requestId));
        return r.ok ? ok(r.body) : r.result;
      }),
  );

  server.registerTool(
    'delete_hotel',
    {
      title: 'Delete a hotel',
      description: 'Remove a hotel booking from its trip. Ask the user first, then pass confirm: true.',
      inputSchema: { hotelId: z.string(), confirm: z.boolean() },
      annotations: { destructiveHint: true },
    },
    ({ hotelId, confirm }) =>
      guard(async () => {
        const denied = needWrite();
        if (denied) return denied;
        if (confirm !== true) return fail('Ask the user, then call again with confirm: true.', { reason: 'confirm_required' });
        const out = await deps.removeHotel(ctx.userId, hotelId);
        return ok({ ok: true, ...(out as unknown as Record<string, unknown>) });
      }),
  );

  server.registerResource(
    'trip',
    new ResourceTemplate('trip://{tripId}', {
      list: async () => {
        const rows = await deps.loadTripsForUser(ctx.userId);
        return {
          resources: rows.map((t) => {
            const r = t as unknown as { id: string; title: string };
            return { uri: `trip://${r.id}`, name: r.title, mimeType: 'text/markdown' };
          }),
        };
      },
    }),
    { title: 'Trip summary', description: 'Readable per-day summary of a trip', mimeType: 'text/markdown' },
    async (uri, { tripId }) => {
      const trip = await readTrip(String(tripId));
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: tripSummary(trip as unknown as SummaryTrip) }] };
    },
  );

  server.registerPrompt(
    'plan_trip',
    {
      title: 'Plan a new trip',
      description: 'Step-by-step workflow to plan a trip with the user',
      argsSchema: { destination: z.string().optional(), dates: z.string().optional() },
    },
    ({ destination, dates }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Help me plan a trip${destination ? ` to ${destination}` : ''}${dates ? ` (${dates})` : ''} in Travel Planner.`,
              '1. Ask me first: destination, dates, who is travelling, budget, interests, pace. Do not guess.',
              '2. Find real places with search_places; use their lat/lng. Never invent coordinates.',
              '3. Draft the plan and call preview_trip. Put travel between stops on the next stop\'s `arrive`, not as a transit place.',
              '4. Show me the preview: days, stops, hotels and every warning. Wait for my yes.',
              '5. Only then call create_trip with the same plan and the confirmToken.',
              '6. To change it later: get_trip → preview_plan_update → show me the diff → apply_plan_update.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'edit_trip',
    { title: 'Edit an existing trip', description: 'Workflow to rearrange a trip safely', argsSchema: { tripId: z.string() } },
    ({ tripId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Help me change trip ${tripId}.`,
              '1. Call get_trip and note every day id (in order) and place id.',
              '2. Build the plan: days = every existing day id in its current order; inside, list places by id in the new order, move a place by listing its id under another day, add new places without id. Adding/removing days is not supported here.',
              '3. Call preview_plan_update and show me the diff (moved, created, deleted, edited) and warnings. Use prune only if I asked to delete the places you left out.',
              '4. After my yes, call apply_plan_update with the same plan and confirmToken. If it says the trip changed, start again from get_trip.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  return server;
}
