# Google Maps Platform — quota caps & budget alerts

Runbook for **Maps #7** (epic: Google Maps Platform cost optimization).

The caps themselves live in the Google Cloud console, not in this repo — this
document is the source of truth for *which* SKUs we consume, *what* the caps
should be, and *why*. Re-read it before changing a limit.

> **Verify prices in the console before acting.** Google restructured Maps
> Platform pricing in March 2025 (per-SKU monthly free tiers replaced the single
> $200 credit) and can change it again. The figures below are what the epic
> recorded when the work was scoped; treat them as the intent, and confirm the
> current rate on the SKU's own row in Cloud Billing.

## 1. SKU inventory — what this app actually calls

Derived from the code, not from guesswork. Keep this table in sync when a call
site is added or removed.

| SKU | Call site | Key used | Notes |
|---|---|---|---|
| **Maps JavaScript API — Dynamic Maps** | `components/persistent-map.tsx` via `components/maps-provider.tsx` (`libraries={['places']}`) | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser) | One map instance, hoisted to `trip/[id]/layout.tsx` so panel navigation does not re-instantiate it (Maps #3b). |
| **Places API — Autocomplete (per session)** | `place-autocomplete.tsx`, `place-search-picker.tsx`, `hotel-place-picker.tsx`, `hotel-search-picker.tsx`, `transport-place-picker.tsx` — all call `AutocompleteSuggestion.fetchAutocompleteSuggestions` | browser key | Debounced. Sessions are *terminated* by the Details fetch below, which is what keeps them on session billing. |
| **Places API — Place Details** | `lib/place-details.ts:64` (`Place.fetchFields`) | browser key | Reached through `PlacePrediction.toPlace()`, so the first `fetchFields` carries the session token and the Details call bills at **$0** as part of the session (Maps #1/#2). A *bare place-id* Details fetch does **not** get this and bills per request. |
| **Maps Static API** | `lib/static-map.ts` → `trip/[id]/opengraph-image.tsx` | `GOOGLE_MAPS_API_KEY` (server-only) | Maps #5. `revalidate = 86400` per trip plus a 7-day `fetch` cache, so volume is roughly *number of public trips shared*, not page views. |

Not used (deliberately removed in Maps #3a): **Routes API**, **Directions**,
**Distance Matrix**. If any of these show up on a bill, it is a regression —
find the call site before raising a cap.

## 2. Two keys, two blast radii

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — **exposed in the browser** and
  unavoidably so: Dynamic Map tiles and the Places JS SDK both run client-side
  (see the Maps #4 findings — a server proxy cannot hide this key). Its only
  real protection is **HTTP-referrer restriction + per-SKU caps**. Treat the
  caps as a security control, not just a budget control.
- `GOOGLE_MAPS_API_KEY` — server-only, used by `lib/static-map.ts`. Restrict it
  by **API** (Maps Static API only) and never expose it.

Both keys should be restricted to exactly the APIs in the table above. An
unrestricted key plus a scraped `NEXT_PUBLIC_` value is how a small app runs up
a four-figure bill overnight.

## 3. Recommended caps

Free tier is granted **per SKU per month**, so a daily cap is derived from
`monthly free allowance ÷ 30`, with headroom for bursty days.

| SKU | Free tier (monthly) | Daily cap to set | Rationale |
|---|---|---|---|
| Dynamic Maps | 10,000 | **500/day** | ~15k/month ceiling. Above the free tier but bounded; a runaway remount loop trips this in hours instead of billing all month. |
| Autocomplete (per session) | 5,000 | **300/day** | ~9k/month. Sessions are per *search*, not per keystroke — real usage should sit far below this. |
| Place Details | 5,000 | **300/day** | Should stay near $0 while sessions terminate correctly. If this counter climbs while Autocomplete does not, a bare-place-id fetch has crept in — investigate, do not raise. |
| Maps Static API | 10,000 | **200/day** | OG images are cached for 24h per trip; 200/day is already generous. |

These are **starting values for a low-traffic app**. Raise them deliberately
after looking at 30 days of actuals, and record the change here with the date
and the reason.

## 4. Setting the caps

Google Cloud console → **APIs & Services → [the API] → Quotas & System Limits**.

1. Filter the quota list to the per-day request quota for the SKU.
2. Select it → **Edit quota** → enter the value from the table above → submit.
   Reductions apply immediately; increases can require review.
3. Repeat for each of the four SKUs.

Behaviour when a cap is hit: the API returns `OVER_QUERY_LIMIT` /
`RESOURCE_EXHAUSTED`. In this app that degrades rather than crashes — the
pickers surface an empty suggestion list, and `fetchStaticMapDataUri` returns
`null`, so the OG card falls back to its gradient. That is the intended
failure mode: a capped day costs a degraded feature, not money.

## 5. Budget alerts

Cloud console → **Billing → Budgets & alerts → Create budget**.

- Scope: the project's Maps Platform services (or the whole project if Maps is
  the only paid service).
- Amount: a **monthly** budget of **$25**. Chosen to sit clearly above $0 —
  so ordinary free-tier months stay silent — while firing long before any
  amount worth arguing with Google about.
- Alert thresholds: **50% / 90% / 100% of actual spend**, plus **100% of
  forecasted spend** so a bad trend is visible mid-month rather than at the end.
- Recipients: the billing account admins. Add a Pub/Sub topic only if we later
  want programmatic key disabling — not needed at this size.

A budget alert **does not stop spending**. It is the detector; the per-SKU caps
in §3 are the actual brake. Both are required.

## 6. Verification

After setting everything up:

- [ ] Each SKU in §1 shows a per-day quota matching §3.
- [ ] Both API keys are API-restricted; the `NEXT_PUBLIC_` one is additionally
      HTTP-referrer-restricted to the production and preview domains.
- [ ] A test budget alert email arrives at the intended recipients.
- [ ] Cloud Billing → Reports, grouped by SKU, lists only the four SKUs in §1.

## 7. Change log

| Date | Change | Why |
|---|---|---|
| 2026-08-04 | Initial thresholds documented (Maps #7). Caps and alerts still to be applied in the console by an operator. | Repo-side half of Maps #7; console access is not available to the agent. |
