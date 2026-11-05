# Scrutiny: TP-0035 MCP server v1 design

Target: `docs/superpowers/specs/2026-11-06-mcp-server-design.md`. Code paths are under `app/src`, and the SDK is `@modelcontextprotocol/sdk` 1.32.2.

**Intent:** a thin MCP wrapper over the hardened REST layer that lets an agent build or edit trips without shell plumbing, and that forces a preview before any bulk write.

**Simpler alternative:** the overall shape (stateless MCP plus PAT plus an HMAC token) is about as small as this can be. A server-side preview store would add state, and a dryRun with no token would not force a preview at all.
- **Option:** merge each preview/commit pair into one tool. `create_trip` without `confirmToken` returns the preview and a token; calling it with the token commits. This drops the catalogue from 10 tools to 8 and removes the "called commit without preview" error path. It is not required.
- **What the token really proves:** a preview happened. It does **not** prove the user saw it (see M1).

## Blocker

### B1. `get_trip` and `trip://{id}` would leak any trip: `loadApiTrip` has no authz
- **Finding:** §2 says "every tool calls the same services as REST, so owner/editor/viewer rules apply unchanged". `loadApiTrip(tripId)` takes no `userId` and does no access check.
- **Why:** if it is wired as the table describes, any valid PAT can read any trip by id. That is an IDOR.
- **Evidence:**
  - `lib/trip-queries.ts:240` takes only `tripId`.
  - REST does the check in the route, not in the service: `app/api/v1/trips/[tripId]/route.ts` calls `requireTripAccess(userId, tripId, 'read')` before `loadApiTrip`.
  - `putTripPlan` and the hotel and leg services do check access internally (`plan-update-orchestrator.ts:76`, `booking-service.ts:104`, `leg-service.ts:309`). Only the read loader is exposed.
- **Suggested change:**
  - State in the design that `get_trip`, the resource template, and the summary call `requireTripAccess(userId, tripId, 'read')` (`lib/api/authz`) first.
  - Add a contract test: "get_trip on another user's trip → isError".
  - Correct the §2 sentence.

## Major

### M1. A read token cannot reach MCP at all, and `withUser` does not expose `scope`
- **Finding:** `withUser` throws 403 for any non-read-write token on a non-GET request, and every MCP call is a POST. A `read` token is rejected before the transport runs, so even `list_trips` fails, and the "tool layer re-check" in §2 is never reached. `withUser` also passes only `userId` to the handler, so `buildServer({ userId, scope, req })` cannot get `scope`.
- **Why:** read-only agents are locked out, and the design's `scope` plumbing does not exist. The route test "write tool with read token → isError" cannot pass through the real route.
- **Evidence:** `lib/api/http.ts:18,30-34`, and `withUser`'s handler signature `(userId: string)`.
- **Suggested change:**
  - Add a sibling helper, for example `withApiContext(req, ({ userId, scope, tokenId }) => Response)`. It should keep auth and the rate limit, skip the method-based scope check, and return a `Response` rather than a `NextResponse`, since the transport returns a plain `Response`.
  - Enforce scope per tool, failing closed on any scope other than `read-write`.

### M2. Rate limit is bypassable through JSON-RPC batches, and the "≤20" cap is not something the SDK does
- **Finding:** the SDK accepts batches of up to `MAX_BATCH_SIZE = 100`, and the limiter counts one unit per HTTP request. A batch of 100 `tools/call` therefore costs 1 unit, which is 100× the REST budget (60/min → 6000 tool calls/min). Nothing in the transport enforces 20.
- **Evidence:**
  - `node_modules/@modelcontextprotocol/sdk/dist/esm/server/requestBody.js:4`
  - `webStandardStreamableHttp.js:504-512`
  - `lib/api/http.ts:21`
- **Suggested change:** pick one of these.
  - (a) Reject array bodies outright with JSON-RPC `-32600`. The 2025-06-18 MCP spec removed batching, and current clients do not send it. This is the simplest option and makes "1 HTTP = 1 call" true.
  - (b) Parse the body in the route, count the `tools/call` entries, consume that many units, then pass `parsedBody` to `handleRequest`.
- Also note that each handshake costs about 3 units (`initialize`, `notifications/initialized`, `tools/list`). Document that, or exempt non-`tools/call` methods.

### M3. Commit retries can 409, because the idempotency fingerprint uses non-canonical JSON
- **Finding:** the token hash uses `canonicalJSON`, but `claimKey`'s fingerprint is `sha256(method\npath\nJSON.stringify(body))`. If a retried `create_trip` / `apply_plan_update` sends the same plan with a different key order, the token check passes (same canonical hash) and then fails with `409 Idempotency-Key reused with a different request`.
- **Evidence:** `lib/api/idempotency.ts:34-38,140-145`.
- **Suggested change:**
  - Before calling the orchestrator, replace the body with `JSON.parse(canonicalJSON(plan))`, with `dryRun` and `ifUpdatedAt` stripped or set by the server.
  - Hash exactly that object, so the token hash and the fingerprint input are the same object by construction.
  - Specify which keys are excluded from `h`:
    - `dryRun` and `ifUpdatedAt` are excluded;
    - `prune` is included.
  - Decide on Unicode handling: either apply NFC before hashing, or document that byte-different Thai strings count as a different plan.

### M4. How `at` is obtained is unspecified and racy, though `ifUpdatedAt = at` is otherwise correct
- **Finding:** the `putTripPlan` dryRun returns `trip: null` and no `updatedAt` (`plan-update-orchestrator.ts:137`). The preview tool must read `updatedAt` separately. If it reads it after the dryRun, a concurrent edit can bind the token to a newer version than the diff the user saw.
- **Evidence:**
  - The version check compares against the snapshot read at line 76 (`:102`).
  - Claim-before-version-check (`:81-96`) means a retried commit replays rather than hitting a 409 on its own bump. Sending `at` as `ifUpdatedAt` on commit is therefore sound.
- **Suggested change:**
  - The preview tool reads `updatedAt` (`loadTripBasic`) **first**.
  - It injects `ifUpdatedAt = at` into the **dryRun** body too. The diff is then provably computed on version `at`, and a mismatch shows up at preview time.
  - If the agent passed its own `ifUpdatedAt`, require that it equals `at`.
- **Also:** `putTripPlan` reads `dryRun` from the body (`plan-update-input.ts:155`), not from a parameter, so the table's `putTripPlan(dryRun)` is wrong in form.

### M5. The commit re-resolves links, so the committed result can differ from the preview, and quota is spent twice
- **Finding:** both orchestrators run link resolution again on commit:
  - import: `resolveImport` at `import-orchestrator.ts:279`;
  - plan update: `applyPlaceLink` / `resolvePlacePatch` at `plan-update-orchestrator.ts:115-131`.

  Google results, the 20 s `LinkBudget` deadline (`place-link.ts:27`) and the daily buckets can all differ between the two runs.
- **Why:** `h` binds the *input*. The pins and warnings the user approved are not guaranteed. Each place also costs two units of the daily places-search and geocode quota.
- **Suggested change:**
  - Accept this for v1, but have the commit tools return `summary` together with a `differsFromPreview` flag. The token can carry a short digest of the preview's warning codes and diff counts for the comparison.
  - Document the 2× quota cost.
  - Longer term: pass the resolved pins through the token, or cache them.

### M6. Orchestrators return error `NextResponse`s as well as throwing, and §6 maps only thrown errors
- **Finding:** these paths **return** a non-2xx response instead of throwing:
  - `claimKey` conflicts (`import-orchestrator.ts:262`, `plan-update-orchestrator.ts:83`);
  - the places rate limit / unavailable path in the search route.

  §6 only describes the `ServiceError` → `isError` mapping.
- **Why:** if the wrapper reads `await res.json()` as success, an idempotency conflict reaches the agent as a successful tool result.
- **Suggested change:** add one adapter, `callRest(res) → status >= 400 ? isError(body.error) : structuredContent(body)`.
- **Feasibility (focus 5):** calling the orchestrators from a tool is feasible. They only read `req.headers` (`idempotency-key`), `req.method` and `req.url` (`idempotency.ts:29-38`), so `new Request(origUrl, { method: 'POST', headers: { 'idempotency-key': k } })` works.
  - Keep that URL fixed, for example `/api/mcp`.
  - Distinct keys per token keep the `create_trip` and `apply_plan_update` fingerprints apart.

### M7. `save_hotel` create is not idempotent over MCP
- **Finding:** REST create runs under `withIdempotencyAtomic` only when the client sends a key (`app/api/v1/trips/[tripId]/hotels/route.ts:23`). Over MCP there is no key, so a retried tool call creates a duplicate hotel. That undercuts §1's "removes idempotency-key management".
- **Suggested change:** add an optional `requestId` input to the create path, map it to `Idempotency-Key`, and tell the agent in the tool description to reuse it on retry.

### M8. The confirm token does not make "show the user first" a hard requirement
- **Finding:** an agent can call `preview_trip` and `create_trip` back to back with no user turn in between. The token proves a preview happened, not that the user consented. Real consent would need elicitation, which stateless JSON-response mode cannot send, because there is no server→client stream.
- **Suggested change:**
  - Reword §1 and §3.1 to describe the token as proof of a preview.
  - Set tool `annotations` so clients gate writes with their own approval UI:
    - `readOnlyHint` on the read and preview tools;
    - `destructiveHint` on `apply_plan_update`, `delete_hotel` and `create_trip`;
    - `idempotentHint` where it applies.
  - In Claude Code and Desktop, these annotations are the mechanism that actually puts a human in the loop.

## Nit

- **N1. Secret:** derive a subkey, `HKDF(AUTH_SECRET, "tp-mcp-confirm-v1")`, rather than HMAC-ing with the raw Auth.js secret. Compare signatures with `timingSafeEqual`. Add `iat` to the payload so each token is unique and two previews give two keys. Re-previewing the same plan after a successful `create_trip` mints a new token, a new key, and a **second trip**. That is acceptable, but document it.
- **N2. Token replay:** within `exp`, replaying the same token returns the stored result. That is correct, and idempotency rows have no TTL cleanup, so a replay after `exp` is rejected by the token check before the orchestrator runs. A failed commit releases its claim (`plan-update-orchestrator.ts:152`), so a retry with the same token works. No change needed; consider adding this as a test.
- **N3. GET/DELETE:** export only `POST` from `route.ts`. Next answers 405 for methods that are not exported, so no handler code is needed. In stateless mode the SDK would otherwise answer GET with an open SSE stream (`webStandardStreamableHttp.js:222`), so the 405 is the right choice.
- **N4. Transport and Vercel:**
  - Declare `export const runtime = 'nodejs'`, as `trips/import/route.ts:11` does.
  - Set a `maxDuration` of at least 60 s, because an import can spend 20 s on links plus the transaction.
  - Use `enableJsonResponse: true` with one fresh transport per request; reusing a transport throws (`:176`).
  - Await `server.connect(transport)` before `handleRequest`.
  - Clients must send `Accept: application/json, text/event-stream`, or they get a 406 (`:452`). Note this in `docs/MCP.md` for generic clients.
- **N5. 401 response:** add `WWW-Authenticate: Bearer` on the 401. Some clients try OAuth discovery on a bare 401, so document that v1 is header-only.
- **N6. `search_places`:** the search itself is already extracted (`lib/places/text-search.ts`, per the route header comment). Only `readNear` / `parseRadius` and the daily-quota block need moving, so the work is smaller than §7 implies.
- **N7. Tests:** add route tests for:
  - a read token → `list_trips` OK and `create_trip` isError (needs M1);
  - a batch body → rejected (M2);
  - a retry with keys reordered → replay rather than 409 (M3);
  - `get_trip` on a foreign trip → isError (B1).

## Verdict

**Fix, then ship.** The architecture is sound, and confirm-token binding plus `ifUpdatedAt` from the token are correct given `putTripPlan`'s claim-before-version-check ordering. The biggest problem is B1: as written, the design would expose any trip through `get_trip`. M1–M3 (scope plumbing, batch amplification, non-canonical fingerprint) need concrete design changes before implementation starts.
