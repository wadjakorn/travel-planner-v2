// Idempotent POST support. An agent that retries a create with the same
// `Idempotency-Key` header gets the original response back instead of a
// duplicate row. Keys are scoped per user. Only successful (2xx) responses
// are cached — a failed attempt can be retried freshly.

import 'server-only';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { apiIdempotencyKeys } from '@/db/schema';

export function idempotencyKey(req: Request): string | null {
  const key = req.headers.get('idempotency-key');
  return key && key.trim() !== '' ? key.trim() : null;
}

type Cached = { statusCode: number; responseJson: unknown };

async function lookup(userId: string, key: string): Promise<Cached | null> {
  const rows = await db
    .select({
      statusCode: apiIdempotencyKeys.statusCode,
      responseJson: apiIdempotencyKeys.responseJson,
    })
    .from(apiIdempotencyKeys)
    .where(
      and(eq(apiIdempotencyKeys.userId, userId), eq(apiIdempotencyKeys.key, key)),
    )
    .limit(1);
  return rows[0] ?? null;
}

// Run `produce` unless a cached response exists for (userId, key). Caches
// 2xx responses. `produce` returns the JSON body and HTTP status.
export async function withIdempotency(
  userId: string,
  key: string | null,
  produce: () => Promise<{ status: number; body: unknown }>,
): Promise<NextResponse> {
  if (!key) {
    const r = await produce();
    return NextResponse.json(r.body, { status: r.status });
  }

  const cached = await lookup(userId, key);
  if (cached) {
    return NextResponse.json(cached.responseJson, { status: cached.statusCode });
  }

  const result = await produce();
  if (result.status >= 200 && result.status < 300) {
    try {
      await db.insert(apiIdempotencyKeys).values({
        userId,
        key,
        statusCode: result.status,
        responseJson: result.body as object,
      });
    } catch {
      // Unique-violation race: a concurrent request stored it first. Return
      // whatever landed so both callers see the same response.
      const raced = await lookup(userId, key);
      if (raced) {
        return NextResponse.json(raced.responseJson, {
          status: raced.statusCode,
        });
      }
    }
  }
  return NextResponse.json(result.body, { status: result.status });
}
