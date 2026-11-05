// /api/v1/places/search/batch (TP-0147)
//   POST { queries: [{ q, near?, radius?, key? }] }  (1..25)
//   -> 200 { results: [{ key, results: [...] } | { key, error: { status, message } }] }
//
// Each query is one GET /places/search: same daily per-user quota bucket,
// same provider-error mapping (lib/api/places-search.ts), run 5 at a time.
// The whole batch is ONE request of the per-token limiter (withUser). A
// failing query (quota, provider down) fails alone; a malformed body is 400.
// POST, so it needs a read-write token (withUser); GET /places/search works
// with a read token.

import { apiJson } from '@/lib/api-response';
import { withUser, readJsonBody } from '@/lib/api/http';
import { searchPlacesForApi } from '@/lib/api/places-search';
import type { Near } from '@/lib/places/text-search';
import { ServiceError } from '@/lib/services/service-error';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const MAX_BATCH = 25;
const CONCURRENCY = 5;

type Parsed = { key: string; q: string; near: Near | null; radius: number | null };

function bad(i: number, msg: string): never {
  throw new ServiceError('bad_request', `queries[${i}]: ${msg}`);
}

function parseNear(v: unknown, i: number): Near | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string') {
    const [a, b, ...rest] = v.split(',').map((s) => s.trim());
    const lat = a === '' ? NaN : Number(a);
    const lng = b === undefined || b === '' ? NaN : Number(b);
    if (rest.length || !Number.isFinite(lat) || !Number.isFinite(lng)) bad(i, '"near" must be "lat,lng" or {"lat":..,"lng":..}');
    return { lat, lng };
  }
  const o = v as { lat?: unknown; lng?: unknown };
  if (typeof o === 'object' && typeof o.lat === 'number' && typeof o.lng === 'number' && Number.isFinite(o.lat) && Number.isFinite(o.lng)) {
    return { lat: o.lat, lng: o.lng };
  }
  bad(i, '"near" must be "lat,lng" or {"lat":..,"lng":..}');
}

export function parseBatch(body: Record<string, unknown>): Parsed[] {
  const qs = body.queries;
  if (!Array.isArray(qs) || qs.length === 0) throw new ServiceError('bad_request', '"queries" must be a non-empty array');
  if (qs.length > MAX_BATCH) throw new ServiceError('bad_request', `"queries" exceeds the limit of ${MAX_BATCH}`);
  return qs.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad(i, 'must be an object');
    const o = raw as Record<string, unknown>;
    const q = typeof o.q === 'string' ? o.q.trim() : '';
    if (!q) bad(i, '"q" is required');
    let radius: number | null = null;
    if (o.radius !== undefined && o.radius !== null) {
      if (typeof o.radius !== 'number' || !Number.isFinite(o.radius) || o.radius <= 0) bad(i, '"radius" must be a positive number of metres');
      radius = o.radius;
    }
    const key = o.key === undefined || o.key === null ? String(i) : String(o.key);
    return { key, q, near: parseNear(o.near, i), radius };
  });
}

export function POST(req: Request) {
  return withUser(req, async (userId) => {
    const items = parseBatch(await readJsonBody(req));
    const out: unknown[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        const it = items[i];
        try {
          const res = await searchPlacesForApi(userId, it.q, it.near, it.radius);
          const body = (await res.json()) as unknown;
          out[i] = res.ok
            ? { key: it.key, results: body }
            : { key: it.key, error: { status: res.status, message: (body as { message?: string })?.message ?? 'search failed' } };
        } catch (e) {
          console.error('[places batch] query failed', e);
          out[i] = { key: it.key, error: { status: 500, message: 'Internal server error' } };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
    return apiJson({ results: out });
  });
}
