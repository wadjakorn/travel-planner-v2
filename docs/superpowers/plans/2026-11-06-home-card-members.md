# TP-0115: home trip cards show seed-only collaborators

## Finding
- `app/(home)/page.tsx` passes `trip.collaborators` to the cards. That is a jsonb column only the demo seed writes.
- The trip header (`app/trip/[id]/layout.tsx`) shows the real members instead: `trip_membership ⋈ user`.

## Change
- **New `loadMembersForTrips(tripIds, exec)`** in `lib/trip-queries.ts`.
  - One `inArray` query for every trip on the page, grouped by trip.
  - It reads the same rows the header reads.
- **Home page:** maps each trip's members to the card's existing `{ initials, color }` shape. There is no card change.
- **Shared helpers:** `initialsOf` / `colorFor` move from `header.tsx` into `lib/avatar.ts`, so a member looks the same on the card and in the header.
- **Seed column:** `trips.collaborators` is no longer read on Home. The column stays for now; dropping it needs a migration and is out of scope.

## Note
The owner has no `trip_membership` row, so neither the header nor the card shows them. This is the same behaviour as the header today.

## Tests
- Unit: `avatar.test.ts`.
- Integration: `loadMembersForTrips` in `trip-queries.integration.test.ts`.
- typecheck, lint.
