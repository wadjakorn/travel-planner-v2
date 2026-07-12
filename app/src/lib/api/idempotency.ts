// Idempotent POST support. An agent that retries a create with the same
// `Idempotency-Key` gets the original response instead of a duplicate.
//
// Race-safe: the key row is *claimed* (pending) atomically before the
// mutation runs, so only one concurrent caller with a given key executes the
// side effect. A key is also bound to a request fingerprint (method + path +
// body) — reusing it for a different request is a 409, not a wrong replay.

import 'server-only';
import { createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db, dbNode } from '@/db';
import { apiIdempotencyKeys } from '@/db/schema';
import { apiError } from '@/lib/api-response';

// A Drizzle executor that can run the idempotency SQL: the neon-http `db`, or a
// postgres-js transaction handed in by a caller (so the completion can commit
// inside the mutation's tx). Both support insert/update/delete used here.
type NodeTx = Parameters<Parameters<typeof dbNode.transaction>[0]>[0];
export type IdemExecutor = typeof db | NodeTx;

// A pending claim older than this is presumed abandoned (owner crashed); a
// retry may delete it and take over. Comfortably above p99 request latency.
export const CLAIM_TTL_MS = 60_000;

export function idempotencyKey(req: Request): string | null {
  const key = req.headers.get('idempotency-key');
  return key && key.trim() !== '' ? key.trim() : null;
}

function fingerprint(req: Request, body: unknown): string {
  const url = new URL(req.url);
  return createHash('sha256')
    .update(`${req.method}\n${url.pathname}\n${JSON.stringify(body ?? {})}`)
    .digest('hex');
}

type Row = {
  id: string;
  fingerprint: string;
  statusCode: number;
  responseJson: unknown;
  createdAt: Date;
};

async function lookup(
  userId: string,
  key: string,
  exec: IdemExecutor = db,
): Promise<Row | null> {
  const rows = await exec
    .select({
      id: apiIdempotencyKeys.id,
      fingerprint: apiIdempotencyKeys.fingerprint,
      statusCode: apiIdempotencyKeys.statusCode,
      responseJson: apiIdempotencyKeys.responseJson,
      createdAt: apiIdempotencyKeys.createdAt,
    })
    .from(apiIdempotencyKeys)
    .where(
      and(eq(apiIdempotencyKeys.userId, userId), eq(apiIdempotencyKeys.key, key)),
    )
    .limit(1);
  return rows[0] ?? null;
}

// Drop a *specific* pending claim (by row id) so the mutation can be retried
// cleanly. Scoping to the observed row id is load-bearing under concurrency:
// deleting by (userId, key) alone lets a slow caller evict a DIFFERENT retry's
// freshly-inserted claim (both would then run the mutation → duplicate). Also
// guarded on statusCode 0 so a completed row is never removed.
export async function releaseClaim(
  userId: string,
  key: string,
  id: string,
  exec: IdemExecutor = db,
): Promise<void> {
  await exec
    .delete(apiIdempotencyKeys)
    .where(
      and(
        eq(apiIdempotencyKeys.userId, userId),
        eq(apiIdempotencyKeys.key, key),
        eq(apiIdempotencyKeys.id, id),
        eq(apiIdempotencyKeys.statusCode, 0),
      ),
    );
}

export type ClaimOutcome =
  | { kind: 'nokey' }
  | { kind: 'owned'; key: string; fp: string; id: string }
  | { kind: 'conflict'; response: NextResponse }
  | { kind: 'replay'; statusCode: number; responseJson: unknown };

export type ClaimOptions = {
  // Take over a pending claim older than CLAIM_TTL_MS (presumed abandoned).
  // OPT-IN and unsafe unless the caller can roll its mutation back on lost
  // ownership: a live-but-slow request whose mutation already committed would
  // otherwise be re-run by the taker → duplicate. Only the import path (whose
  // marker write rolls the tx back when its claim is gone) enables this. Simple
  // `withIdempotency` callers leave it off, so a stale pending claim stays a 409
  // (a crashed claim blocks that key rather than risking a duplicate).
  allowTakeover?: boolean;
};

// Claim an Idempotency-Key or resolve to a replay/conflict. Encapsulates the
// atomic pending-claim insert, the fingerprint check, and opt-in TTL takeover.
export async function claimKey(
  userId: string,
  req: Request,
  body: unknown,
  exec: IdemExecutor = db,
  opts: ClaimOptions = {},
): Promise<ClaimOutcome> {
  const key = idempotencyKey(req);
  if (!key) return { kind: 'nokey' };
  const fp = fingerprint(req, body);

  for (let attempt = 0; attempt < 2; attempt++) {
    // TS can't resolve the overloaded, generic `.returning()` signature across
    // the `typeof db | NodeTx` union (a known TS limitation with overloads on
    // union call targets), so this one call is narrowed to `typeof db`'s shape.
    // Both drivers execute the identical query at runtime.
    const claim = await (exec as typeof db)
      .insert(apiIdempotencyKeys)
      .values({ userId, key, fingerprint: fp, statusCode: 0, responseJson: {} })
      .onConflictDoNothing({
        target: [apiIdempotencyKeys.userId, apiIdempotencyKeys.key],
      })
      .returning({ id: apiIdempotencyKeys.id });
    if (claim.length > 0) return { kind: 'owned', key, fp, id: claim[0].id };

    const existing = await lookup(userId, key, exec);
    if (!existing) continue; // released mid-race — retry the claim
    if (existing.fingerprint !== fp) {
      return {
        kind: 'conflict',
        response: apiError('conflict', 'Idempotency-Key reused with a different request'),
      };
    }
    if (existing.statusCode === 0) {
      const stale =
        opts.allowTakeover &&
        existing.createdAt.getTime() < Date.now() - CLAIM_TTL_MS;
      if (stale) {
        // Delete only the stale row we observed (by id). If a concurrent retry
        // already took over and inserted a fresh claim, this deletes nothing and
        // the loop re-arbitrates via onConflictDoNothing → we yield with a 409.
        await releaseClaim(userId, key, existing.id, exec);
        continue; // retry the claim — takeover
      }
      return {
        kind: 'conflict',
        response: apiError('conflict', 'A request with this Idempotency-Key is still in progress'),
      };
    }
    return { kind: 'replay', statusCode: existing.statusCode, responseJson: existing.responseJson };
  }
  // Pathological churn: stay safe rather than run unguarded.
  return {
    kind: 'conflict',
    response: apiError('conflict', 'A request with this Idempotency-Key is still in progress'),
  };
}

// Write the completed response onto the (already-claimed) row via any executor.
// Called with `db` on the normal path, or a `dbNode` tx to commit atomically
// with the mutation (import). Scoped to the claimed row `id`: if a TTL takeover
// deleted this claim while the mutation ran, the row is gone and this updates
// nothing — it returns 0 so the caller can roll back rather than stamp its
// result onto a different retry's fresh claim. Returns rows affected (0 or 1).
export async function persistCompletion(
  exec: IdemExecutor,
  userId: string,
  key: string,
  id: string,
  status: number,
  json: unknown,
): Promise<number> {
  // Same `.returning()` union-overload limitation as the claim insert; narrowed
  // to `typeof db`'s shape, identical query on both drivers at runtime.
  const updated = await (exec as typeof db)
    .update(apiIdempotencyKeys)
    .set({ statusCode: status, responseJson: json as object })
    .where(
      and(
        eq(apiIdempotencyKeys.userId, userId),
        eq(apiIdempotencyKeys.key, key),
        eq(apiIdempotencyKeys.id, id),
      ),
    )
    .returning({ id: apiIdempotencyKeys.id });
  return updated.length;
}

export async function withIdempotency(
  userId: string,
  req: Request,
  body: unknown,
  produce: () => Promise<{ status: number; body: unknown }>,
  exec: IdemExecutor = db,
): Promise<NextResponse> {
  const outcome = await claimKey(userId, req, body, exec);
  if (outcome.kind === 'conflict') return outcome.response;
  if (outcome.kind === 'replay') {
    return NextResponse.json(outcome.responseJson, { status: outcome.statusCode });
  }
  if (outcome.kind === 'nokey') {
    const r = await produce();
    return NextResponse.json(r.body, { status: r.status });
  }
  // owned
  try {
    const r = await produce();
    if (r.status >= 200 && r.status < 300) {
      await persistCompletion(exec, userId, outcome.key, outcome.id, r.status, r.body);
    } else {
      await releaseClaim(userId, outcome.key, outcome.id, exec);
    }
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await releaseClaim(userId, outcome.key, outcome.id, exec);
    throw err;
  }
}
