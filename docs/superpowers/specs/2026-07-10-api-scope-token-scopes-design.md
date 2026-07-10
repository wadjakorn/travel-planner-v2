# API-SCOPE — Per-token read/write scopes for `/api/v1`

**Date:** 2026-07-10
**Ticket:** `[API-SCOPE]` (`HKIJ3ZUM6--O`) — child of `[EPIC] API v1 hardening & expansion` (`qdIoykC3QCeO`)
**Status:** design approved

## Context

The completed API-expose group (API-R/A/B/C/R2) shipped per-user personal
access tokens with **single full-access** semantics — any valid token can read
and write every resource the owning user can reach. API-A explicitly deferred
scopes as an open question. This ticket adds **read vs read-write** scopes,
enforced across all of `/api/v1`.

Key codebase facts that shaped the design:

- Every `/api/v1` route handler flows through **`withUser()`** in
  `app/src/lib/api/http.ts` — a single choke point (17 route files, 16
  write handlers).
- Every write is a non-`GET` method (`POST`/`PATCH`/`PUT`/`DELETE`); every read
  is `GET`. HTTP method maps cleanly to read-vs-write.
- The error contract already maps `ServiceError('forbidden')` → **403**
  (`app/src/lib/api-response.ts`, `service-error.ts`).
- Token model `api_token` (`app/src/db/schema.ts` ~line 572) has no scope column.
- `resolveApiToken()` (`lib/api-tokens.ts`) returns `{ userId }` only.
- Mint UI lives in `app/src/components/api-tokens-section.tsx`; server action in
  `app/src/app/actions/api-tokens.ts`.

## Decisions

- **Enforcement: method-based, centralized in `withUser`.** Not per-route flags
  (churn + insecure-default risk on new routes), not granular resource scopes
  (YAGNI, deferred).
- **Two scope values only:** `read`, `read-write`.
- **New-token default:** `read-write` (matches today's behavior; least surprise).
- **Existing tokens:** backfilled to `read-write` via the column default so no
  live integration breaks.
- **Scope is immutable per token:** to change scope, revoke and re-mint. (No
  in-place scope edit — keeps the model and UI minimal.)

## Design

### 1. Data model

Add one column to `api_token` (`app/src/db/schema.ts`):

```ts
scope: text('scope', { enum: ['read', 'read-write'] })
  .notNull()
  .default('read-write'),
```

Drizzle migration: `ADD COLUMN scope ... NOT NULL DEFAULT 'read-write'`. The
default backfills every existing row to `read-write`.

### 2. Resolver + auth plumbing

- `resolveApiToken()` (`lib/api-tokens.ts`): select and return `scope` →
  `{ userId, scope }`. Also add `scope` to `ApiTokenSummary` (read-only display).
- `requireApiUser()` (`lib/api-auth.ts`): propagate `{ userId, scope }`.
- **`withUser()` (`lib/api/http.ts`) — the single enforcement point:**

  ```ts
  const { userId, scope } = await requireApiUser(req);
  if (scope === 'read' && req.method !== 'GET') {
    throw new ServiceError('forbidden', 'Token lacks write scope');
  }
  return handler(userId);
  ```

  No changes to the 16 write handlers. New routes are covered automatically — a
  write method always demands write scope (secure by construction). `HEAD` is
  not used by these routes; only `GET` is treated as read.

### 3. Minting: service + settings UI

- `createApiToken(userId, name, scope)` gains a `scope` arg (default
  `'read-write'`).
- Server action `actions/api-tokens.ts`: read scope from the form, pass through.
- `components/api-tokens-section.tsx`: add a **read-only / read-write** selector
  at mint (defaults to read-write); show each token's scope in the list.

### 4. Testing

- **Unit:** `resolveApiToken` returns scope; `withUser` 403s a `read` token on
  `POST`/`PATCH`/`DELETE`, allows `GET`; allows all methods for `read-write`.
- **Integration smoke** (live dev DB, matching prior API tickets): mint a read
  token → `GET /api/v1/trips` 200, `POST /api/v1/trips` 403; mint read-write →
  both succeed. Assert existing (pre-migration) tokens resolve as `read-write`.

### 5. Docs

Update the API reference/quickstart: the two scopes, scope chosen at mint time
and immutable (revoke + re-mint to change), and the 403 write-scope error shape.

## Files touched

`db/schema.ts` (+ migration), `lib/api-tokens.ts`, `lib/api-auth.ts`,
`lib/api/http.ts`, `actions/api-tokens.ts`, `components/api-tokens-section.tsx`,
API docs, tests.

## Out of scope

- Granular per-resource scopes (`trips:write`, …).
- Changing a token's scope in place.
- Rate-limiting personal access tokens (that is `[API-SEC]`).
