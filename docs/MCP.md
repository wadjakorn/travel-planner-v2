# Connect your agent (MCP)

Travel Planner runs an [MCP](https://modelcontextprotocol.io) server at **`/api/mcp`**. It uses Streamable HTTP and is stateless. Any MCP client can use it to build and edit trips: Claude Code, Claude Desktop, Cursor, or your own agent. Edits show up in the web app right away.

## 1. Get a token

In **Settings → API tokens**:
- Create a **read-write** token to build and edit trips.
- A **read** token can list, read, search and preview, but every write tool refuses it.

v1 accepts the token **as a header only**. There is no OAuth sign-in flow yet.

## 2. Add the server

**Claude Code**

```bash
claude mcp add --transport http travel-planner https://travel-planner-v2-eight.vercel.app/api/mcp \
  --header "Authorization: Bearer tp_YOUR_TOKEN"
```

**Claude Desktop / Cursor / other clients** with a JSON config:

```json
{
  "mcpServers": {
    "travel-planner": {
      "type": "http",
      "url": "https://travel-planner-v2-eight.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer tp_YOUR_TOKEN" }
    }
  }
}
```

**Generic HTTP client**
- Send `POST` with `Content-Type: application/json` and `Accept: application/json, text/event-stream`. Without that `Accept` header you get a 406.
- Send one JSON-RPC message per request. Batches are rejected.
- `GET` returns 405.

## 3. Tools

| Tool | What it does |
|---|---|
| `list_trips` | Lists your trips, owned or shared. |
| `get_trip` | Returns the full trip plus a readable per-day summary: stops, approximate driving distance and time, the night's hotel, and ⚠ flags. |
| `search_places` | Finds real places by name, with optional `near` / `radius`. Draws on a daily per-user quota. |
| `preview_trip` → `create_trip` | Creates a new trip from an import-shaped plan. The preview writes nothing and returns a `confirmToken`. |
| `preview_plan_update` → `apply_plan_update` | Edits an existing trip. It can reorder places, move them across days, edit or create places, and optionally prune places. The preview returns the diff and a `confirmToken`. |
| `set_leg` | Sets how you travel into a place (`drive` / `walk` / `transit`, minutes, note). |
| `save_hotel` | Creates a hotel or patches one by `id`. Supports `status: "tbd"` + `area`. |
| `delete_hotel` | Removes a hotel. Requires `confirm: true`. |

The resource `trip://{tripId}` is the trip summary as markdown. Prompts `plan_trip` and `edit_trip` walk an agent through the workflow.

## 4. The preview rule

`create_trip` and `apply_plan_update` only accept a `confirmToken` from the matching preview of the **same** plan. Key order does not matter.
- **Lifetime:** the token is valid for 30 minutes and is bound to your account and, for edits, to the trip version the preview saw.
- **When it changes:** if the plan or the trip changed after the preview, preview again.
- **What it proves:** the token shows that a preview happened. It does not show that you saw it. Write tools are marked `destructiveHint`, so clients such as Claude ask you before running them.
- **Retries:** a retry with the same token replays the result rather than writing twice. Previewing the same plan again gives a new token, and committing that one creates a **second** trip.
- **Cost:** the commit resolves places again, so map lookups count twice. `differsFromPreview: true` means the result differs from what you saw, for example a place resolved to a different pin.

## 5. Limits

- **Per-token rate limit:** each HTTP request counts once, the same as `/api/v1`. Connecting costs about 3 requests: `initialize`, `initialized`, `tools/list`.
- **Not available yet:** client attribution in the audit log, and tools for expenses, notes and transport. Use the REST API in `agent-skill/travel-planner-api/SKILL.md` for those.
