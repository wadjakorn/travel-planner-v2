// The quota + provider-error half of GET /api/v1/places/search, shared with
// the MCP `search_places` tool (TP-0035). Returns the REST response so both
// callers map rate-limit / unavailable the same way.

import 'server-only';
import type { NextResponse } from 'next/server';
import { apiJson, apiRateLimited, apiUnavailable } from '@/lib/api-response';
import { consumeRateLimitKey } from '@/lib/api/rate-limit';
import { GoogleHttpError } from '@/lib/places/google';
import {
  PLACES_SEARCH_DAILY_CAP,
  PlacesSearchUnavailableError,
  placesSearchBucket,
  searchPlacesByText,
  type Near,
} from '@/lib/places/text-search';

// Pragmatic v1 per-user quota (API-AGENT-UX, PLACES_SEARCH_DAILY_CAP in
// text-search.ts). Its own key, so it does NOT double-count against the
// per-token limiter (withUser) or the import geocode limiter
// (`geocode:${userId}`). Shared with import `query` resolution (TP-0140).
const DAY_SECONDS = 86_400;

export async function searchPlacesForApi(
  userId: string,
  q: string,
  near: Near | null,
  radius: number | null,
): Promise<NextResponse> {
  // Per-user daily cap. Fail open if the limiter DB is down — an outage must
  // not break search (mirrors lib/places/rate-limit.ts).
  try {
    const rl = await consumeRateLimitKey(placesSearchBucket(userId), PLACES_SEARCH_DAILY_CAP, DAY_SECONDS);
    if (!rl.ok) {
      return apiRateLimited(
        rl.retryAfter,
        `Daily place-search limit reached (${PLACES_SEARCH_DAILY_CAP}/day). Retry after ${rl.retryAfter}s.`,
      );
    }
  } catch {
    // fail open
  }
  try {
    return apiJson(await searchPlacesByText(q, { near, radius }));
  } catch (e) {
    if (e instanceof PlacesSearchUnavailableError) {
      return apiUnavailable('Place search is not configured on this server');
    }
    if (e instanceof GoogleHttpError) {
      return apiUnavailable('Place search provider is unavailable', 502);
    }
    throw e;
  }
}
