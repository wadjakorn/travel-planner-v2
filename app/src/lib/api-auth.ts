// Bearer-token auth for `/api/v1/*`. Parses the Authorization header,
// resolves the token to a user, and throws a ServiceError('unauthorized')
// when the token is missing, malformed, unknown, or revoked. Route handlers
// wrap the call in try/catch and map via apiErrorFrom.

import 'server-only';
import { resolveApiToken } from '@/lib/api-tokens';
import { ServiceError } from '@/lib/services/service-error';

function extractBearer(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Returns the acting user id for a valid token, else throws 401.
export async function requireApiUser(req: Request): Promise<{ userId: string }> {
  const token = extractBearer(req);
  if (!token) {
    throw new ServiceError('unauthorized', 'Missing bearer token');
  }
  const resolved = await resolveApiToken(token);
  if (!resolved) {
    throw new ServiceError('unauthorized', 'Invalid or revoked token');
  }
  return resolved;
}
