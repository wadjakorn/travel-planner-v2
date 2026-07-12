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

// Drop a pending claim so the mutation can be retried cleanly. Guarded on
// statusCode 0 so a completed row is never removed.
async function releaseClaim(
  userId: string,
  key: string,
  exec: IdemExecutor = db,
): Promise<void> {
  await exec
    .delete(apiIdempotencyKeys)
    .where(
      and(
        eq(apiIdempotencyKeys.userId, userId),
        eq(apiIdempotencyKeys.key, key),
        eq(apiIdempotencyKeys.statusCode, 0),
      ),
    );
}

export async function withIdempotency(
  userId: string,
  req: Request,
  body: unknown,
  produce: () => Promise<{ status: number; body: unknown }>,
  exec: IdemExecutor = db,
): Promise<NextResponse> {
  const key = idempotencyKey(req);
  if (!key) {
    const r = await produce();
    return NextResponse.json(r.body, { status: r.status });
  }

  const fp = fingerprint(req, body);

  // Atomically claim the key (pending). The unique (userId, key) index makes
  // exactly one concurrent caller win the insert.
  //
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

  if (claim.length === 0) {
    // Another request owns this key.
    const existing = await lookup(userId, key, exec);
    if (!existing) {
      // Lost the row between conflict and read (claim released). Run fresh.
      const r = await produce();
      return NextResponse.json(r.body, { status: r.status });
    }
    if (existing.fingerprint !== fp) {
      return apiError('conflict', 'Idempotency-Key reused with a different request');
    }
    if (existing.statusCode === 0) {
      return apiError('conflict', 'A request with this Idempotency-Key is still in progress');
    }
    return NextResponse.json(existing.responseJson, { status: existing.statusCode });
  }

  // We own the claim — run the mutation exactly once.
  try {
    const result = await produce();
    if (result.status >= 200 && result.status < 300) {
      await exec
        .update(apiIdempotencyKeys)
        .set({ statusCode: result.status, responseJson: result.body as object })
        .where(
          and(
            eq(apiIdempotencyKeys.userId, userId),
            eq(apiIdempotencyKeys.key, key),
          ),
        );
    } else {
      await releaseClaim(userId, key, exec);
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    await releaseClaim(userId, key, exec);
    throw err;
  }
}
