# Scrutiny: [API-MEM] plan

**Intent:** expose the existing People section (members list, invite, revoke) to API agents, with the same permissions.

**Simpler alternative: read-only members.** That is enough for "who's on this trip". Invites are what the epic asks for, though, and the owner-only rule plus the write scope keep them safe. Extracting the services also removes duplicated authz from the actions. Keep the full plan.

## Trace

- **Permissions:**
  - `canManageInvites` (`trip-access.ts:69`) allows only the owner.
  - `requireTripAccess(read)` covers members.
  - `withUser` blocks POST and DELETE for read-only tokens.
- **Token secrecy:**
  - `hashInviteToken` is SHA-256 and only the hash is stored (`invite-service.ts:40`).
  - The API returns the plaintext once, like the settings reveal.
  - **Do not** run invite creation through `withIdempotencyAtomic`, because it stores the response body and the token would be kept in plaintext. The plan excludes it.
- **Owner shown separately:** an owner has no membership row, so the members list adds `owner` from `trips.owner_id`. That reflects the real roster better than the header, which omits the owner.
- **Revoke:**
  - Revoke sets `status = 'revoked'`.
  - Accepting a revoked invite is refused by `acceptInvite` (`'unavailable'`).
  - **Check:** does revoking an already accepted invite make sense? The action allows it, but it has no effect on the membership. Mirror the action and return ok.
- **Enumeration:**
  - `DELETE /invites/:id` with a foreign id resolves the trip and then returns 403 rather than 404, the same as the action.
  - Ids are UUIDs, so the risk is low.
  - **Choice:** return 404 for "not found or not yours". It is safer for an API surface and costs nothing.

**Verdict:** ship, with the 404 choice above.
