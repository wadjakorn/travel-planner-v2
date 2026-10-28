// /api/v1/places/search
//   GET ?q=<text>&near=<lat,lng>&radius=<m>
//     -> 200 [{ placeId, name, lat, lng, address, types? }]
//
// Server-side Google Places (New) Text Search by name (TP-0038). PAT auth like
// every v1 route. The search itself lives in lib/places/text-search.ts so it is
// reusable as the MCP `search_places` tool later (TP-0035/EVG).

import { apiJson, apiRateLimited, apiUnavailable } from '@/lib/api-response';
import { withUser } from '@/lib/api/http';
import { consumeRateLimitKey } from '@/lib/api/rate-limit';
import { GoogleHttpError } from '@/lib/places/google';
import {
  PlacesSearchUnavailableError,
  searchPlacesByText,
  type Near,
} from '@/lib/places/text-search';
import { ServiceError } from '@/lib/services/service-error';

// Pragmatic v1 per-user quota (API-AGENT-UX). Its own key, so it does NOT
// double-count against the per-token limiter (withUser) or the import geocode
// limiter (`geocode:${userId}`). The full per-user Google budget stays deferred.
export const PLACES_SEARCH_DAILY_CAP = 200;
const DAY_SECONDS = 86_400;

function parseNear(v: string | null): Near | null {
  if (!v) return null;
  const parts = v.split(',').map((s) => s.trim());
  // Number('') === 0, so an empty component ("13.7,") must be rejected
  // explicitly or it would silently parse to lng:0.
  const lat = parts[0] === '' ? NaN : Number(parts[0]);
  const lng = parts[1] === '' ? NaN : Number(parts[1]);
  if (parts.length !== 2 || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ServiceError('bad_request', '"near" must be "lat,lng"');
  }
  return { lat, lng };
}

function parseRadius(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ServiceError('bad_request', '"radius" must be a positive number of metres');
  }
  return n;
}

export function GET(req: Request) {
  return withUser(req, async (userId) => {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') ?? '').trim();
    if (!q) throw new ServiceError('bad_request', 'Query param "q" is required');
    const near = parseNear(searchParams.get('near'));
    const radius = parseRadius(searchParams.get('radius'));

    // Per-user daily cap. Fail open if the limiter DB is down — an outage must
    // not break search (mirrors lib/places/rate-limit.ts).
    try {
      const rl = await consumeRateLimitKey(`places:search:${userId}`, PLACES_SEARCH_DAILY_CAP, DAY_SECONDS);
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
      const results = await searchPlacesByText(q, { near, radius });
      return apiJson(results);
    } catch (e) {
      if (e instanceof PlacesSearchUnavailableError) {
        return apiUnavailable('Place search is not configured on this server');
      }
      if (e instanceof GoogleHttpError) {
        return apiUnavailable('Place search provider is unavailable', 502);
      }
      throw e;
    }
  });
}
