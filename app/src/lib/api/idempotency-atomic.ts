// Atomic idempotent completion for simple POST endpoints (API-IDEM follow-up).
// Runs the route's mutation AND persistCompletion in ONE dbNode transaction,
// scoped to the claim row id. If a TTL takeover deleted the claim while a slow
// owner ran, persistCompletion updates 0 rows -> we throw -> the whole tx rolls
// back -> the mutation leaves no row. That makes allowTakeover safe here, so a
// crashed pending claim self-heals instead of blocking the key with a 409.
//
// Unlike import-orchestrator this stores the FULL response body (not a marker):
// the created entity is read back inside the same tx, so replay just returns it.

import 'server-only';
import { NextResponse } from 'next/server';
import { db, dbNode } from '@/db';
import {
  claimKey,
  persistCompletion,
  releaseClaim,
  type IdemExecutor,
} from '@/lib/api/idempotency';

export type AtomicRunResult = { status: number; body: unknown };
export type AtomicDeps = { idemDb?: IdemExecutor; txDb?: typeof dbNode };

// Thrown inside the tx to force a rollback; caught by the outer handler.
class TakeoverLostError extends Error {}
class NonSuccessResult extends Error {
  constructor(public result: AtomicRunResult) {
    super('non-success result');
  }
}

export async function withIdempotencyAtomic(
  userId: string,
  req: Request,
  body: unknown,
  run: (tx: IdemExecutor) => Promise<AtomicRunResult>,
  deps: AtomicDeps = {},
): Promise<NextResponse> {
  const idemDb = deps.idemDb ?? db;
  const txDb = deps.txDb ?? dbNode;

  // Import opts into TTL takeover too; simple endpoints can now do the same
  // because the mutation + completion commit atomically (see file header).
  const outcome = await claimKey(userId, req, body, idemDb, {
    allowTakeover: true,
  });
  if (outcome.kind === 'conflict') return outcome.response;
  if (outcome.kind === 'replay') {
    return NextResponse.json(outcome.responseJson, { status: outcome.statusCode });
  }
  if (outcome.kind === 'nokey') {
    // No Idempotency-Key: no claim row exists, so atomicity is moot — run on the
    // plain executor (parity with withIdempotency's nokey branch).
    const r = await run(idemDb);
    return NextResponse.json(r.body, { status: r.status });
  }

  // owned: mutation + completion commit atomically inside one tx.
  const { key, id } = outcome;
  try {
    const r = await txDb.transaction(async (tx) => {
      const res = await run(tx as unknown as IdemExecutor);
      if (res.status < 200 || res.status >= 300) {
        // A failed create must not be cached as a completed result; abort.
        throw new NonSuccessResult(res);
      }
      const n = await persistCompletion(
        tx as unknown as IdemExecutor,
        userId,
        key,
        id,
        res.status,
        res.body,
      );
      if (n === 0) {
        // Our claim was taken over mid-flight; roll the mutation back so the
        // taker's row is the only one. Same guarantee as import-orchestrator.
        throw new TakeoverLostError();
      }
      return res;
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    // The tx rolled back. The claim row (inserted before the tx) survives, so
    // release it — scoped to our id and status_code=0, a no-op if a taker
    // already replaced it. Then surface the original error.
    await releaseClaim(userId, key, id, idemDb);
    if (err instanceof NonSuccessResult) {
      return NextResponse.json(err.result.body, { status: err.result.status });
    }
    throw err; // ServiceError -> mapped by withUser; TakeoverLostError -> 5xx
  }
}
