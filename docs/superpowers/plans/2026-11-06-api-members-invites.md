# [API-MEM]: trip members and invites over /api/v1

Ticket: [API-MEM], from epic "API v1 hardening". It was blocked by [API-SCOPE], which is now in **tested**: per-token read and write scopes exist.

## Goal
An agent can see who is on a trip, and the owner's agent can invite someone or revoke an invite. This is the same capability the trip Settings → People section already has. Nothing new is invented.

## Endpoints (v1)

| Method / path | Who | Body / result |
|---|---|---|
| `GET /trips/:tripId/members` | anyone with read access | `{ owner: { userId, name, email, image }, members: [{ userId, name, email, image, role }] }` |
| `GET /trips/:tripId/invites` | owner (`canManageInvites`) | `{ invites: [{ id, email, role, status, expiresAt, createdAt }] }`, newest first. Pending and expired invites are included, so the caller can see what was sent. |
| `POST /trips/:tripId/invites` | owner, write scope | `{ email*, role?: editor\|viewer }` → `201 { invite, url }`. `url` is the one-time `/invite/<token>` link. Only its hash is stored, so the link is shown only in this response. |
| `DELETE /invites/:inviteId` | owner of the invite's trip, write scope | `{ ok, tripId }` |

**Not in v1:**
- Removing a member, or changing a member's role. The web app doesn't support either, and that needs its own design.
- Regenerating an invite. Revoke it and create a new one instead.
- Accepting an invite. That is a human sign-in flow.

**Idempotency:**
- `POST /invites` does **not** honour `Idempotency-Key`.
- A replay would have to store the plaintext token in `api_idempotency_key`, which defeats hashing it.
- Retrying creates a second pending invite, which is harmless and can be revoked. This is documented.

## Service extraction
`lib/services/invite-service.ts` gains:
- `listMembers(userId, tripId)`: read access via `requireTripAccess`.
- `listInvites(userId, tripId)`: owner only.
- `createInvite(userId, tripId, { email, role })`:
  - owner only;
  - validates `email` (contains `@`, trimmed, lowercase) and `role`;
  - writes the audit row;
  - returns `{ invite, token }`.
- `revokeInvite(userId, inviteId)`: owner of the invite's trip; writes the audit row.

The web actions `createInviteAction` and `revokeInviteAction` call these services. Their redirect and revalidate behaviour is unchanged, so the web and the API share one permission check.

## Errors
- `400`: bad email or role.
- `403`: not the owner.
- `404`: the trip or invite is not found or not visible.
- Thrown as `ServiceError`.

## Tests
- **Integration** (tp-test-pg), invite-service:
  - an owner can create, list and revoke;
  - an editor gets 403;
  - a viewer can list members but not invites;
  - a bad email gets 400;
  - revoking a foreign invite gets 403;
  - the created token's hash matches the stored hash.
- **Docs:** SKILL.md §4 and API.md rows.
