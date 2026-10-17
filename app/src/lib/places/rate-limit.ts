import 'server-only';
import { consumeRateLimitKey } from '@/lib/api/rate-limit';
import type { RateLimitResult } from '@/lib/api/rate-limit-policy';

// One bucket per user, shared by autocomplete and details.
export const PLACES_RATE_LIMIT = { max: 120, windowSeconds: 600 } as const;

type Consume = (key: string, max: number, windowSeconds: number) => Promise<RateLimitResult>;

// Fails open: a limiter outage must not break place search.
export async function allowPlacesRequest(
  userId: string,
  consume: Consume = consumeRateLimitKey,
): Promise<boolean> {
  try {
    const r = await consume(`places:${userId}`, PLACES_RATE_LIMIT.max, PLACES_RATE_LIMIT.windowSeconds);
    return r.ok;
  } catch {
    return true;
  }
}
