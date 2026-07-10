// Personal access token store. Only the SHA-256 hash of a token is
// persisted; the plaintext is returned once at creation and never again.
//
// Token format: `tp_<43 base64url chars>` (256 bits of entropy). The `tp_`
// prefix aids leak detection (secret scanners can pattern-match it).

import 'server-only';
import { randomBytes, createHash } from 'crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { apiTokens, type ApiToken } from '@/db/schema';

const TOKEN_PREFIX = 'tp_';

export type ApiTokenScope = 'read' | 'read-write';

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function generatePlaintext(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

// Metadata safe to show in a list — never includes the hash or plaintext.
export type ApiTokenSummary = {
  id: string;
  name: string;
  scope: ApiTokenScope;
  createdAt: Date;
  lastUsedAt: Date | null;
};

function toSummary(row: ApiToken): ApiTokenSummary {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

// Mint a token for a user. Returns the one-time plaintext plus the summary.
export async function createApiToken(
  userId: string,
  name: string,
  scope: ApiTokenScope = 'read-write',
): Promise<{ plaintext: string; token: ApiTokenSummary }> {
  const plaintext = generatePlaintext();
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name, scope, tokenHash: hashToken(plaintext) })
    .returning();
  return { plaintext, token: toSummary(row) };
}

// List a user's live (non-revoked) tokens, newest first.
export async function listApiTokens(
  userId: string,
): Promise<ApiTokenSummary[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map(toSummary);
}

// Revoke a token, owner-scoped. Returns true if a live token was revoked.
export async function revokeApiToken(
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiTokens.id, tokenId),
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt),
      ),
    )
    .returning({ id: apiTokens.id });
  return rows.length > 0;
}

// Resolve a plaintext bearer token to its user id, or null if it is
// unknown or revoked. Stamps `lastUsedAt` on a hit (best-effort).
export async function resolveApiToken(
  plaintext: string,
): Promise<{ userId: string; scope: ApiTokenScope } | null> {
  if (!plaintext.startsWith(TOKEN_PREFIX)) return null;
  const rows = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      scope: apiTokens.scope,
    })
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenHash, hashToken(plaintext)),
        isNull(apiTokens.revokedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id));

  return { userId: row.userId, scope: row.scope };
}
