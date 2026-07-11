// Shared plumbing for /api/v1 route handlers: bearer auth + uniform error
// mapping + JSON body parsing. Keeps each route handler down to its domain
// logic.

import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { apiErrorFrom, apiRateLimited } from '@/lib/api-response';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { ServiceError } from '@/lib/services/service-error';

// Authenticate, then run `handler` with the acting user id. Any thrown
// ServiceError (or unknown error) is mapped to the JSON error contract.
export async function withUser(
  req: Request,
  handler: (userId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const { tokenId, userId, scope } = await requireApiUser(req);
    // Rate limit before doing any work — applies to reads and writes alike,
    // keyed per token. Over the limit -> 429 with Retry-After (seconds).
    const rl = await consumeRateLimit(tokenId);
    if (!rl.ok) {
      return apiRateLimited(
        rl.retryAfter,
        `Rate limit exceeded (${rl.limit} requests/min). Retry after ${rl.retryAfter}s.`,
      );
    }
    // Fail closed: only an explicit read-write scope may mutate. Any other
    // value (read, or an unrecognized one) is confined to safe methods.
    const isSafeMethod = req.method === 'GET' || req.method === 'HEAD';
    if (scope !== 'read-write' && !isSafeMethod) {
      throw new ServiceError('forbidden', 'Token lacks write scope');
    }
    return await handler(userId);
  } catch (err) {
    return apiErrorFrom(err);
  }
}

// Parse a JSON object body, or throw bad_request. Rejects arrays/primitives.
export async function readJsonBody(
  req: Request,
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new ServiceError('bad_request', 'Invalid or missing JSON body');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ServiceError('bad_request', 'Body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

// Typed string field readers for request bodies.
export function reqString(
  body: Record<string, unknown>,
  field: string,
): string {
  const v = body[field];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ServiceError('bad_request', `Field "${field}" is required`);
  }
  return v;
}

export function optString(
  body: Record<string, unknown>,
  field: string,
): string | null | undefined {
  const v = body[field];
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string') {
    throw new ServiceError('bad_request', `Field "${field}" must be a string`);
  }
  return v;
}
