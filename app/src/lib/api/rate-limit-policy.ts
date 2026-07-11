// Pure rate-limit policy: env-tunable limits + the decision that turns a
// window row into an allow/deny. No DB or `server-only` imports so it is
// unit-testable in isolation (see rate-limit-policy.test.ts). The SQL that
// produces the window row lives in rate-limit.ts.

// Positive-integer env override, or the default. Guards against a malformed
// value (NaN, 0, negative, fractional) silently disabling or breaking the
// limiter — anything invalid falls back to the default.
export function posIntEnv(name: string, fallback: number): number {
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

// The post-increment window state returned by the UPSERT: the count seen in
// the current window and whole seconds until it resets.
export type WindowRow = { count: number; resetIn: number };

// Decide allow/deny from the window row. `row` is undefined when the UPSERT
// returned nothing — fail open (don't 500 the caller on a storage quirk)
// rather than fail closed. retryAfter is always >= 1 second.
export function decideRateLimit(
  row: WindowRow | undefined,
  max: number = RATE_LIMIT_MAX,
  windowSeconds: number = RATE_LIMIT_WINDOW_SECONDS,
): RateLimitResult {
  if (!row || row.count <= max) return { ok: true };
  return {
    ok: false,
    retryAfter: Math.max(1, Number(row.resetIn) || windowSeconds),
    limit: max,
  };
}
