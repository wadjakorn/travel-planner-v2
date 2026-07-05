'use server';

// Session-authed server actions backing the Settings → API access panel.
// These return data to the client (the modal awaits them directly). The
// machine-facing side — bearer auth for /api/v1 — lives in lib/api-auth.

import { requireUserId } from '@/lib/with-trip-auth';
import {
  createApiToken as createToken,
  listApiTokens as listTokens,
  revokeApiToken as revokeToken,
  type ApiTokenSummary,
} from '@/lib/api-tokens';

export async function listApiTokensAction(): Promise<ApiTokenSummary[]> {
  const userId = await requireUserId();
  return listTokens(userId);
}

export async function createApiTokenAction(
  name: string,
): Promise<{ plaintext: string; token: ApiTokenSummary }> {
  const userId = await requireUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Token name is required');
  return createToken(userId, trimmed);
}

export async function revokeApiTokenAction(
  tokenId: string,
): Promise<{ revoked: boolean }> {
  const userId = await requireUserId();
  const revoked = await revokeToken(userId, tokenId);
  return { revoked };
}
