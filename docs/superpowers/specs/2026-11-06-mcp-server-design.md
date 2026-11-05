# TP-0035: MCP server v1 (bring your own agent)

**Status: design v2.** This revision applies the scrutiny in `…-design.scrutiny.md`: 1 blocker and 8 majors. Section 10 binds; where it conflicts with an earlier section, section 10 wins.

Ticket: TP-0035. This is the last ticket of AAUX2. The 2026-11-04 decision is binding:
- **Personal access token (PAT) only in v1.** OAuth 2.1 comes in a later phase.
- **dryRun → confirm token → commit is mandatory at the tool level for bulk writes.**
- MCP should be a thin wrapper over the REST layer that waves 1–3 already hardened (TP-0139..0149).

## 1. Why

Agents using the REST API plus SKILL.md hand-build `curl`, `jq` and `uuidgen` calls. That causes several problems:
- They have to escape Thai JSON inside heredocs.
- They have to add `sleep` themselves to stay under the 60/min limit.
- They have to manage idempotency keys.
- The token passes through the shell.
- During testing an agent imported to prod **before the user confirmed**.

MCP removes the plumbing. The confirm token makes "show the user first" a hard requirement rather than a prompt suggestion.

## 2. Transport and auth

- **Endpoint:** `POST /api/mcp`, Streamable HTTP, **stateless**.
  - Uses `WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined` and `enableJsonResponse: true`.
  - A fresh `McpServer` is built per request, with the authenticated user bound into the tool closures.
  - `GET` and `DELETE` return `405`, because there are no sessions and no server-initiated stream.
  - Runtime: Node.js (Fluid compute), not Edge.
- **Auth:** the existing PAT, sent as `Authorization: Bearer tp_…`.
  - It goes through `withUser`, so it reuses `requireApiUser`, the per-token rate limit (one MCP HTTP call counts once), and write-scope enforcement.
  - `withUser` only allows mutation on non-GET requests for `read-write` tokens. Every MCP call is a POST, so the tool layer re-checks this: **write tools reject a `read` token** with a tool error.
  - A missing or invalid token returns `401` JSON, same as v1, before any MCP handling.
- **Trip permissions:** every tool calls the same services as REST, so owner/editor/viewer rules (`requireTripAccess`) apply unchanged.

## 3. Tool catalogue (v1)

All tool inputs are zod schemas with short, action-oriented descriptions. Outputs are `structuredContent` (JSON) plus one text block: a readable summary, or the JSON for small results.

| Tool | Kind | Wraps | Notes |
|---|---|---|---|
| `list_trips` | read | `loadTripsForUser` | id, title, dates, `updatedAt` |
| `get_trip` | read | `loadApiTrip` | Full JSON plus a **readable per-day summary** (§4) |
| `search_places` | read | `searchPlacesForApi` (extracted from `GET /places/search`) | Same daily quota bucket. `near` takes `"lat,lng"` or `{lat,lng}`. No batch: TP-0147 stays deferred, and agents can call it in parallel |
| `preview_trip` | dry run | `importTripIdempotent(dryRun)` | Returns preview, `warnings`, `summary`, and **`confirmToken`** |
| `create_trip` | **bulk write** | `importTripIdempotent` | Requires a `confirmToken` from `preview_trip` for the **same** plan |
| `preview_plan_update` | dry run | `putTripPlan(dryRun)` | Returns `diff`, `warnings`, `summary`, and **`confirmToken`**, which is bound to the trip's `updatedAt` |
| `apply_plan_update` | **bulk write** | `putTripPlan` | Requires `confirmToken`. The server sends `ifUpdatedAt` from the token itself |
| `set_leg` | write | `setPlaceArrive` | Writes one leg (`arrive` or `null`). Small, so no confirm |
| `save_hotel` | write | hotel create / `patchHotel` | `id` → patch, else create. Supports `status:"tbd"` + `area` |
| `delete_hotel` | **destructive** | `removeHotel` | Requires `confirm: true` (soft delete) |

**Deliberately absent in v1:**
- per-place add/edit/delete: `preview_plan_update` / `apply_plan_update` covers them, with review;
- expenses, notes, transport tools;
- trip delete.

These stay available over REST. Missing MCP tools can be added later without schema churn.

### 3.1 Confirm token

```
confirmToken = base64url(payload) + "." + base64url(HMAC-SHA256(AUTH_SECRET, payload))
payload = { v: 1, u: userId, k: "create_trip" | "apply_plan_update", t: tripId?, h: sha256(canonicalJSON(plan)), at: trip.updatedAt?, exp: now + 30 min }
```

- `preview_*` mints the token **only when the dry run succeeds**.
- `create_trip` / `apply_plan_update` verify, and reject with a tool error naming the fix ("call preview_plan_update again") when any of these fail:
  - the signature;
  - `exp`;
  - `u` equals the caller;
  - `k` matches the tool;
  - `t` matches the trip;
  - `h` equals the hash of the plan being committed.
- **Plan changed after preview** → reject. The user confirmed a specific diff, so a different body needs a new preview.
- `apply_plan_update` sends `ifUpdatedAt = at`, so the existing 409 covers "trip changed since the preview".
- **Idempotency:** the commit tools synthesise `Idempotency-Key = sha256(token)`, so a retried tool call replays instead of writing twice.
- **Secret:**
  - `AUTH_SECRET`, already required by Auth.js. It is read via `process.env` and never logged.
  - If it is missing in dev, the tool fails closed with "server not configured".
- **Canonical JSON:** keys are sorted recursively, so the agent re-serialising the same plan produces the same hash.

## 4. `get_trip` readable summary

One line per day, followed by trip-level flags. Example:

`Day 3 · Sat Nov 14 · 5 stops · drive ~140 km / ~3 h 05 · hotel: Dogo Onsen (tbd) · ⚠ 2 stops without a pin`

- Distances and times come from TP-0149 `estDistanceKm` / `estDurationMin`. A leg's own `durationMin` wins over the estimate.
- Flags:
  - `no hotel tonight`, using `splitHotelsForDay` with `endHotels`, on any day before the last;
  - `N stops without a pin`;
  - `long drive`, at more than 4 h, the same threshold as `long_drive_day`.
- Kept in a pure function (`lib/mcp/trip-summary.ts`), unit-tested.

## 5. Resources and prompts

- **Resource template `trip://{tripId}`:** the `get_trip` summary text with `mimeType: text/markdown`. It is listable through `list_trips`.
- **Prompt `plan_trip`:** the planning workflow as a single user message:
  1. **Ask:** destination, dates, travellers, budget, interests, pace. Mirrors SKILL.md §0.5.
  2. **Search** places with `search_places`.
  3. **Draft** with `preview_trip`.
  4. **Show the user** the preview and warnings. Wait for a yes.
  5. **Create** with `create_trip`.
  6. **Edit** with `preview_plan_update` → show → `apply_plan_update`.
- **Prompt `edit_trip`:** the steps for editing an existing trip.

## 6. Safety

- **Rate limits:** the per-token limiter, with one count per MCP HTTP request. Tool calls inside one batch request are capped at 20 calls per HTTP request (JSON-RPC batch); beyond that the server returns an error.
- **Writes:** confirm tokens for bulk writes, and `confirm: true` for deletes.
- **Audit:** the existing service-level audit rows attribute writes to the user.
  - **Not in v1:** client attribution ("which agent"). `audit_log` has no client column. This needs a migration and is a follow-up.
- **Errors:** a `ServiceError` becomes `isError: true` with its `message`, plus `reason` / `details` in `structuredContent` (TP-0146 `extra`).
  - Unknown errors return "internal error" without a stack trace.

## 7. Modules

- `app/src/app/api/mcp/route.ts`: POST → `withUser` → `buildServer(ctx)` → transport `handleRequest`. GET/DELETE → 405.
- `app/src/lib/mcp/server.ts`: `buildServer({ userId, scope, req })`, which registers tools, resources and prompts.
- `app/src/lib/mcp/confirm-token.ts`: `mintConfirmToken` and `verifyConfirmToken`. Pure, apart from crypto.
- `app/src/lib/mcp/trip-summary.ts`: the pure summary.
- `app/src/lib/api/places-search.ts`: `searchPlacesForApi`, extracted from the route. The route keeps its behaviour.
- `docs/MCP.md`, the "Connect your agent" guide:
  - Claude Code: `claude mcp add --transport http travel-planner https://…/api/mcp --header "Authorization: Bearer tp_…"`;
  - Claude Desktop, Cursor, and a generic client.
- SKILL.md gets a pointer to MCP.

## 8. Tests

- **Unit:**
  - **Confirm tokens:**
    - a valid token passes;
    - a tampered payload or signature fails;
    - an expired token fails;
    - a token from another user fails;
    - a token for another trip fails;
    - a token for another plan fails;
    - a token minted for a different tool fails;
    - two plan objects with different key order verify the same.
  - **Trip summary:**
    - legs use the estimate, and `durationMin` wins over it;
    - the "no hotel" flag;
    - the "no pin" flag;
    - the long-drive flag.
- **Tool contract tests** use the SDK's in-memory client/server pair with services mocked:
  - `tools/list` names and schemas;
  - `create_trip` without a token, or with a token for a different plan, returns `isError`;
  - preview → create passes the right `dryRun` and idempotency key;
  - `apply_plan_update` passes `ifUpdatedAt` from the token;
  - a write tool with a `read` token returns `isError`;
  - `delete_hotel` without `confirm` returns `isError`.
- **Route tests:**
  - no token → 401;
  - GET → 405;
  - `initialize` + `tools/list` over HTTP with a mocked `requireApiUser`.
- **e2e:** none (batch rule). The MCP flow has no UI.

## 9. Out of scope / follow-ups

- OAuth 2.1 / Dynamic Client Registration and a "connected clients" settings list.
- Client attribution in audit.
- Batch search (TP-0147).
- Expense, notes and transport tools.
- A settings-page snippet. For now, `docs/MCP.md` and the existing token UI cover it.

## 10. v2 resolutions

| # | Resolution |
|---|---|
| B1 | `get_trip`, the `trip://` resource and `list_trips` run `requireTripAccess(userId, tripId, 'read')` before `loadApiTrip`, mirroring the REST route. Contract test: a foreign trip returns `isError`. The §2 claim is corrected: only the write services check access internally. |
| M1 | New `withApiContext(req, ({ userId, scope, tokenId }) => Response)` in `lib/api/http.ts`. It does auth and the per-token rate limit, **with no method-based scope check**, and the error mapping returns a `Response`. `buildServer` receives `scope`. Every write tool fails closed unless `scope === 'read-write'`. A `read` token can use `list_trips`, `get_trip`, `search_places` and both `preview_*` tools. |
| M2 | The route rejects a JSON **array** body with JSON-RPC `-32600` "batching is not supported". MCP 2025-06-18 removed batching, so one HTTP request is one call. The handshake costs about 3 rate-limit units; `docs/MCP.md` says so. The "≤20 per request" text in §6 is void. |
| M3 | One canonical body object. The tool builds `plan = JSON.parse(canonicalJSON(input.plan))`. The hash input and the body passed to the orchestrator are that same object; the server adds `dryRun` / `ifUpdatedAt` afterwards, and neither key is part of `h`. `prune` sits inside `plan`, so it is hashed. Strings are NFC-normalised before hashing and before sending. |
| M4 | `preview_plan_update` reads `trip.updatedAt` **first** (one `select`, after `requireTripAccess` write). It injects `ifUpdatedAt = at` into the dryRun body as well, so the diff is computed on `at`. If the agent sent its own `ifUpdatedAt` that differs from `at`, the tool rejects. The orchestrators take `dryRun` / `ifUpdatedAt` from the body, which is what the tool builds; the old `putTripPlan(dryRun)` notation was shorthand. |
| M5 | Accepted for v1: a commit re-resolves links, so pins can differ and quota is spent twice. Mitigation: the token carries `d`, a digest of the preview (diff counts plus sorted warning codes). A commit response includes `differsFromPreview: boolean`. `docs/MCP.md` documents the 2× lookup cost. |
| M6 | One adapter, `fromResponse(res)`: status ≥ 400 → `isError` with `{ error, message, reason?, details? }` taken from the JSON body; otherwise structured content. A thrown `ServiceError` is mapped the same way. Unknown errors → "internal error". |
| M7 | `save_hotel` takes an optional `requestId` (UUID). On create it becomes `Idempotency-Key`. The tool description says to reuse it on retry. `apply_plan_update` / `create_trip` derive their key from the token (§3.1). |
| M8 | Reworded: the token proves **a preview happened**, not that the user consented. Tool `annotations`: `readOnlyHint` on the read and preview tools; `destructiveHint` on `create_trip`, `apply_plan_update` and `delete_hotel`; `idempotentHint` on `set_leg` and preview. Clients (Claude Code / Desktop) gate writes on these. Real elicitation needs sessions or SSE, which is out of scope. |
| N1 | Key = `HKDF-SHA256(AUTH_SECRET, info "tp-mcp-confirm-v1")`. Signatures are compared with `timingSafeEqual`. The payload includes `iat`. Documented: re-previewing the same plan after a successful `create_trip` mints a new token, and committing it creates a **second** trip. |
| N2 | Test: a retry with the same token replays and creates no second trip. |
| N3 | `route.ts` exports **only POST**, so Next answers 405 for GET and DELETE. |
| N4 | `runtime = 'nodejs'` and `maxDuration = 60`. Each request gets a fresh `McpServer` and transport with `enableJsonResponse: true`, and calls `await server.connect(transport)` before `handleRequest`. `docs/MCP.md` notes that clients must send `Accept: application/json, text/event-stream`. |
| N5 | A 401 carries `WWW-Authenticate: Bearer realm="travel-planner"`. Docs: v1 accepts a header token only. |
| N6 | `searchPlacesForApi` moves only `readNear`, `parseRadius` and the quota block out of the route. |
| N7 | Route and contract tests are added as listed in the scrutiny. |
