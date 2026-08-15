// Rate limiting for anonymous traffic (TP-0031).
// Plan: ../../../docs/plans/invite-only-access.md §3.4.
//
// Deliberately NOT global middleware: every checked request costs one Neon
// round trip, and middleware would tax static assets and signed-in users too.
// Only three narrow buckets are limited (see BUCKETS below), and an
// authenticated caller is never limited — a valid session skips the check.
//
// Keys are `bucket:sha256(ip + RATE_LIMIT_IP_SALT)` truncated, so Postgres
// never holds a raw-IP log. On Vercel the client IP is the first hop of
// x-forwarded-for. Locally that header is spoofable, so the limit is
// best-effort in dev — stated rather than pretended away.

import 'server-only';
import { headers } from 'next/headers';
import { consumeRateLimitKey } from './api/rate-limit';
import { posIntEnv, type RateLimitResult } from './api/rate-limit-policy';

export type Bucket = 'signin' | 'join' | 'anon';

// max = requests permitted per window, per IP. Both halves env-tunable, the
// same convention as API_RATE_LIMIT_*.
const BUCKETS: Record<Bucket, { max: number; windowSeconds: number }> = {
  // The magic-link send is the one sign-in path with real cost (SMTP + a
  // verificationToken row), so this is the tightest bucket.
  signin: {
    max: posIntEnv('ANON_RATE_LIMIT_SIGNIN_MAX', 10),
    windowSeconds: posIntEnv('ANON_RATE_LIMIT_SIGNIN_WINDOW_SECONDS', 600),
  },
  join: {
    max: posIntEnv('ANON_RATE_LIMIT_JOIN_MAX', 30),
    windowSeconds: posIntEnv('ANON_RATE_LIMIT_JOIN_WINDOW_SECONDS', 600),
  },
  anon: {
    max: posIntEnv('ANON_RATE_LIMIT_ANON_MAX', 120),
    windowSeconds: posIntEnv('ANON_RATE_LIMIT_ANON_WINDOW_SECONDS', 600),
  },
};

export function clientIpFrom(h: Headers): string {
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip')?.trim() || 'unknown';
}

// Truncated to 32 hex chars: still 128 bits of collision resistance, half the
// row width of the full digest.
export async function rateLimitKey(bucket: Bucket, ip: string): Promise<string> {
  const salt = process.env.RATE_LIMIT_IP_SALT ?? '';
  const data = new TextEncoder().encode(`${ip}${salt}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  )
    .join('')
    .slice(0, 32);
  return `${bucket}:${hex}`;
}

// Consume one unit of `bucket` for the current request's IP.
// Fails open on an unexpected storage error: a limiter outage must not take
// sign-in down with it (the pure decision already fails open on an empty row).
export async function consumeAnonBudget(
  bucket: Bucket,
  h?: Headers,
): Promise<RateLimitResult> {
  const { max, windowSeconds } = BUCKETS[bucket];
  try {
    const requestHeaders = h ?? (await headers());
    const key = await rateLimitKey(bucket, clientIpFrom(requestHeaders));
    return await consumeRateLimitKey(key, max, windowSeconds);
  } catch {
    return { ok: true };
  }
}

export function bucketLimits(bucket: Bucket) {
  return BUCKETS[bucket];
}
