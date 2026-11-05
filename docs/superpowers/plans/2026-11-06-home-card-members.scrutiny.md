# Scrutiny: TP-0115

- **Intent:** home cards show the same people as the trip header.
- **Simpler alternative:** one query per trip. Rejected because it is N+1 on Home. The batch query costs one round trip.
- **Trace:**
  - The home page awaits `loadTripsForUser`, then `loadMembersForTrips(ids)`.
  - The result goes to `TripsBrowser` → `TripCard.collaborators` as `{ initials, color }`, the existing prop shape.
  - The header now imports the moved helpers, and its output is unchanged.
- **Privacy:** the user only sees trips they own or are a member of (`loadTripsForUser`), and the members of those trips are already visible in the trip header.
- **Verdict:** ship.
