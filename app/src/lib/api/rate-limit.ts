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
//
// The allow/deny decision + env tuning live in rate-limit-policy.ts (pure,
// unit-tested); this module owns only the SQL.

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { apiRateLimits } from '@/db/schema';
import {
  RATE_LIMIT_WINDOW_SECONDS,
  decideRateLimit,
  type RateLimitResult,
} from './rate-limit-policy';

export {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_SECONDS,
  type RateLimitResult,
} from './rate-limit-policy';

// Consume one unit of the token's budget. Returns { ok:false, retryAfter }
// once the window's count exceeds the limit; retryAfter is whole seconds until
// the current window resets (always >= 1). `database` is injectable so an
// integration test can drive the real SQL against a test Postgres (any Drizzle
// Postgres client works — the query is standard SQL).
export async function consumeRateLimit(
  tokenId: string,
  database: typeof db = db,
): Promise<RateLimitResult> {
  const windowSql = sql`interval '1 second' * ${RATE_LIMIT_WINDOW_SECONDS}`;
  const rows = await database
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

  return decideRateLimit(rows[0]);
}
