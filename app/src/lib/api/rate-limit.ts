// Per-token rate limiting for /api/v1 (API-SEC). A leaked or abused personal
// access token would otherwise hammer the API unbounded. Each token gets a
// fixed-window counter persisted in Postgres (api_rate_limit) so the limit
// holds across serverless instances without any external store (Redis/KV).
//
// The whole check is one atomic UPSERT: insert a fresh window, or — on
// conflict — either increment the count (same window still open) or reset it
// (window elapsed). The RETURNING row tells us the post-increment count and
// the window start, from which we derive Retry-After. Concurrent requests for
// the same token serialize on the row, so the count cannot be undercounted.

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { apiRateLimits } from '@/db/schema';

// Positive-integer env override, or the default. Guards against a malformed
// value (NaN, 0, negative, fractional) silently disabling or breaking the
// limiter — anything invalid falls back to the default.
function posIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

// Default: 60 requests per rolling 60s window, per token. Tune later; override
// in tests/ops via env without a redeploy.
export const RATE_LIMIT_MAX = posIntEnv('API_RATE_LIMIT_MAX', 60);
export const RATE_LIMIT_WINDOW_SECONDS = posIntEnv(
  'API_RATE_LIMIT_WINDOW_SECONDS',
  60,
);

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number; limit: number };

// Consume one unit of the token's budget. Returns { ok:false, retryAfter }
// once the window's count exceeds the limit; retryAfter is whole seconds until
// the current window resets (always >= 1).
export async function consumeRateLimit(
  tokenId: string,
): Promise<RateLimitResult> {
  const windowSql = sql`interval '1 second' * ${RATE_LIMIT_WINDOW_SECONDS}`;
  const rows = await db
    .insert(apiRateLimits)
    .values({ tokenId, count: 1 })
    .onConflictDoUpdate({
      target: apiRateLimits.tokenId,
      set: {
        // Same window still open -> increment; elapsed -> restart at 1.
        count: sql`case when ${apiRateLimits.windowStart} > now() - ${windowSql}
                     then ${apiRateLimits.count} + 1 else 1 end`,
        windowStart: sql`case when ${apiRateLimits.windowStart} > now() - ${windowSql}
                     then ${apiRateLimits.windowStart} else now() end`,
      },
    })
    .returning({
      count: apiRateLimits.count,
      // Whole seconds remaining until this window resets, floored at 0.
      resetIn: sql<number>`greatest(0, ceil(extract(epoch from (${apiRateLimits.windowStart} + ${windowSql} - now()))))`.as(
        'reset_in',
      ),
    });

  const row = rows[0];
  // Defensive: a missing RETURNING row means we can't prove the caller is over
  // the limit, so allow the request rather than fail closed on a storage quirk.
  if (!row || row.count <= RATE_LIMIT_MAX) return { ok: true };

  return {
    ok: false,
    retryAfter: Math.max(1, Number(row.resetIn) || RATE_LIMIT_WINDOW_SECONDS),
    limit: RATE_LIMIT_MAX,
  };
}
