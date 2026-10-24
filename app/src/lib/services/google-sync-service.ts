// Daily purge of expired Google rating/reviews/hours (TP-0047, resync design
// §5). Read paths already hide expired values via visibleVolatile; this
// removes them from storage. Runs regardless of MAPS_PROVIDER.
//
// No deleted_at filter (soft-deleted rows must not keep Google data either),
// no updated_at bump and no touchTrip: this is housekeeping, not a user edit.

import 'server-only';
import { and, asc, eq, gte, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { days, places, trips } from '@/db/schema';
import type { IdemExecutor } from '@/lib/api/idempotency';
import { consumeRateLimitKey } from '@/lib/api/rate-limit';
import { MAPS_CONFIG, type MapsConfig } from '@/lib/maps/config';
import { GoogleHttpError, googleRefreshDetails, isValidGoogleId } from '@/lib/places/google';
import { fakeGoogleFetch } from '@/lib/places/google-fake';
import { mergeGoogleRefresh, VOLATILE_TTL_MS, type MergeRow, type RefreshPatch } from '@/lib/places/google-sync';
import { queryLang } from '@/lib/places/lang';
import { isGooglePlaceId } from '@/lib/places/place-id';
import { allowPlacesRequest, type Consume } from '@/lib/places/rate-limit';
import { googleBreakerOpen, noteGoogleFailure } from '@/lib/places/search';
import { resolvePlaceWrite } from '@/lib/services/access';

export async function purgeExpiredVolatile(
  now: Date,
  exec: IdemExecutor = db,
): Promise<{ rating: number; hours: number }> {
  const cutoff = new Date(now.getTime() - VOLATILE_TTL_MS);
  const rating = await (exec as typeof db)
    .update(places)
    .set({ rating: null, reviews: null, ratingSyncedAt: null })
    .where(lt(places.ratingSyncedAt, cutoff))
    .returning({ id: places.id });
  const hours = await (exec as typeof db)
    .update(places)
    .set({ hours: null, hoursSyncedAt: null })
    .where(lt(places.hoursSyncedAt, cutoff))
    .returning({ id: places.id });
  return { rating: rating.length, hours: hours.length };
}

// ---------------------------------------------------------------------------
// Google place re-sync (TP-0049, resync design §4). The cron refreshes the
// soonest trips' places within a daily budget; the button refreshes one place
// on its own bucket. Background writes never touch updated_at or touchTrip.

export type ResyncCandidate = MergeRow & { id: string; updatedAt: Date };
export type RefreshOutcome = 'ok' | 'not_found' | 'invalid' | 'skipped' | 'unavailable' | 'limit' | 'error';
export type RefreshSource = 'cron' | 'manual';
export type RefreshDeps = {
  now?: () => Date;
  config?: MapsConfig;
  fetchImpl?: typeof fetch;
  consume?: Consume;
  /** Default 'cron'. */
  source?: RefreshSource;
  select?: (now: Date, limit: number) => Promise<ResyncCandidate[]>;
  /** false = the row changed since it was read. */
  write?: (id: string, patch: RefreshPatch, rowUpdatedAt: Date) => Promise<boolean>;
  load?: (placeId: string) => Promise<ResyncCandidate | null>;
};

const DAY_S = 86400;
const RESYNC_AGE_MS = 25 * 86_400_000;

const CANDIDATE_COLS = {
  id: places.id,
  updatedAt: places.updatedAt,
  name: places.name,
  address: places.address,
  lat: places.lat,
  lng: places.lng,
  phone: places.phone,
  website: places.website,
  rating: places.rating,
  reviews: places.reviews,
  hours: places.hours,
  ratingSyncedAt: places.ratingSyncedAt,
  hoursSyncedAt: places.hoursSyncedAt,
  googleSnapshot: places.googleSnapshot,
  googleSyncedAt: places.googleSyncedAt,
  googleStatus: places.googleStatus,
  placeIdExternal: places.placeIdExternal,
};

export async function selectResyncCandidates(
  now: Date,
  limit: number,
  exec: IdemExecutor = db,
): Promise<ResyncCandidate[]> {
  const today = now.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - RESYNC_AGE_MS).toISOString();
  return (exec as typeof db)
    .select(CANDIDATE_COLS)
    .from(places)
    .innerJoin(days, eq(days.id, places.dayId))
    .innerJoin(trips, eq(trips.id, days.tripId))
    .where(
      and(
        sql`strpos(${places.placeIdExternal}, ':') = 0`,
        sql`${places.placeIdExternal} <> ''`,
        or(isNull(places.googleStatus), notInArray(places.googleStatus, ['NOT_FOUND', 'INVALID'])),
        isNull(places.deletedAt),
        isNull(trips.deletedAt),
        gte(trips.endDate, today),
        or(isNull(places.googleSyncedAt), sql`${places.googleSyncedAt} < ${cutoff}::timestamp`),
      ),
    )
    .orderBy(sql`${trips.startDate} asc nulls last`, sql`${places.googleSyncedAt} asc nulls first`, asc(places.id))
    .limit(limit);
}

// Conditional on the updated_at read with the row: a user save in between
// makes this a no-op. The bind is an ISO string cast to ::timestamp, never a
// raw Date (inside sql``, a Date is formatted in the process time zone).
export async function writeRefreshPatch(
  id: string,
  patch: RefreshPatch,
  rowUpdatedAt: Date,
  exec: IdemExecutor = db,
): Promise<boolean> {
  const rows = await (exec as typeof db)
    .update(places)
    .set(patch)
    .where(
      and(
        eq(places.id, id),
        sql`date_trunc('milliseconds', ${places.updatedAt}) = ${rowUpdatedAt.toISOString()}::timestamp`,
      ),
    )
    .returning({ id: places.id });
  return rows.length === 1;
}

async function loadCandidate(placeId: string, exec: IdemExecutor = db): Promise<ResyncCandidate | null> {
  const rows = await (exec as typeof db)
    .select(CANDIDATE_COLS)
    .from(places)
    .where(and(eq(places.id, placeId), isNull(places.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function refreshOne(row: ResyncCandidate, deps: RefreshDeps = {}): Promise<RefreshOutcome> {
  const cfg = deps.config ?? MAPS_CONFIG;
  const now = (deps.now ?? (() => new Date()))();
  const t = now.getTime();
  const write = deps.write ?? ((id, patch, u) => writeRefreshPatch(id, patch, u));
  const W = async (x: Parameters<typeof mergeGoogleRefresh>[1], outcome: RefreshOutcome): Promise<RefreshOutcome> =>
    (await write(row.id, mergeGoogleRefresh(row, x, now), row.updatedAt)) ? outcome : 'skipped';

  if (!cfg.googlePlaces) return 'unavailable';
  const id = row.placeIdExternal;
  if (!id || !isGooglePlaceId(id)) return 'error';
  if (!isValidGoogleId(id)) return W('INVALID', 'invalid');
  if (googleBreakerOpen(t)) return 'unavailable';

  const fake = cfg.google.fake;
  if (!fake) {
    const manual = deps.source === 'manual';
    const bucket = manual ? 'gplaces:refresh:manual' : 'gplaces:refresh';
    const max = manual ? cfg.google.caps.refreshManual : cfg.google.caps.refresh;
    try {
      const r = await (deps.consume ?? consumeRateLimitKey)(bucket, max, DAY_S);
      if (!r.ok) return 'limit';
    } catch {
      // Fails open, like search.ts consumeDaily.
    }
  }

  let g: Awaited<ReturnType<typeof googleRefreshDetails>>;
  try {
    g = await googleRefreshDetails(id, {
      key: cfg.google.serverKey,
      // || not ??: an empty snapshot name must not force English.
      lang: queryLang(row.googleSnapshot?.name || row.name),
      fetchImpl: fake ? fakeGoogleFetch() : (deps.fetchImpl ?? fetch),
    });
  } catch (e) {
    if (e instanceof GoogleHttpError && e.status === 404) return W('NOT_FOUND', 'not_found');
    if (e instanceof GoogleHttpError && e.status === 400) return W('INVALID', 'invalid');
    if (noteGoogleFailure(e, t)) return 'unavailable';
    return 'error';
  }
  if (g === null) return W('INVALID', 'invalid');
  return W(g, 'ok');
}

export async function runGoogleResync(deps: RefreshDeps = {}): Promise<{
  refreshed: number;
  notFound: number;
  invalid: number;
  skipped: number;
  failed: number;
  stopped: null | 'disabled' | 'breaker' | 'budget';
}> {
  const cfg = deps.config ?? MAPS_CONFIG;
  const out = { refreshed: 0, notFound: 0, invalid: 0, skipped: 0, failed: 0, stopped: null as null | 'disabled' | 'breaker' | 'budget' };
  if (!cfg.googlePlaces) return { ...out, stopped: 'disabled' };
  const now = (deps.now ?? (() => new Date()))();
  const rows = await (deps.select ?? ((n, l) => selectResyncCandidates(n, l)))(now, cfg.google.caps.refresh);
  for (const row of rows) {
    const r = await refreshOne(row, { ...deps, config: cfg, source: deps.source ?? 'cron' });
    if (r === 'ok') out.refreshed++;
    else if (r === 'not_found') out.notFound++;
    else if (r === 'invalid') out.invalid++;
    else if (r === 'skipped') out.skipped++;
    else if (r === 'error') out.failed++;
    else if (r === 'unavailable') return { ...out, stopped: 'breaker' };
    else if (r === 'limit') return { ...out, stopped: 'budget' };
  }
  return out;
}

/** The "Update from Google" button. Throws ServiceError('forbidden') for non-writers. */
export async function refreshPlaceFromGoogle(
  userId: string,
  placeId: string,
  deps: RefreshDeps & { exec?: IdemExecutor; allow?: (userId: string) => Promise<boolean> } = {},
): Promise<RefreshOutcome> {
  const exec = deps.exec ?? db;
  await resolvePlaceWrite(userId, placeId, exec);
  if (!(await (deps.allow ?? ((u) => allowPlacesRequest(u)))(userId))) return 'limit';
  const row = await (deps.load ?? ((id) => loadCandidate(id, exec)))(placeId);
  if (!row) return 'error';
  if (row.googleStatus === 'NOT_FOUND') return 'not_found';
  if (row.googleStatus === 'INVALID') return 'invalid';
  return refreshOne(row, {
    ...deps,
    write: deps.write ?? ((id, patch, u) => writeRefreshPatch(id, patch, u, exec)),
    source: 'manual',
  });
}
