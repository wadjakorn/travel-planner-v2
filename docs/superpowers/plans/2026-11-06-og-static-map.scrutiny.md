# Scrutiny: TP-0113

- **Intent:** stop serving cached Google Static Maps imagery from our server.
- **Simpler alternative:** the change is a single config line. Removing the Google builder would only add churn: no config selects it, so it is inert either way.
- **Trace:**
  - `staticMap` is read only by `lib/static-map.ts`.
  - That module's exports are called only by `opengraph-image.tsx`.
  - A grep finds nothing else that switches on `'google'` for static maps.
- **Risk:** a production deployment without a Geoapify key loses the map on its OG cards. The cards still render, so the failure is graceful. The PR calls this out.
- **Verdict:** ship.
