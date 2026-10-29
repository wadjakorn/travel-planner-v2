# Maps Cloud Style (light + dark) Implementation Plan

> **Ticket:** TP-0080

> **✅ Decisions answered by the user (2026-10-29) — these override anything below:**
> - **D4 / Decision C — Retail → Shopping is shown normally (On, Google default styling)**, not hidden and not faint. Grocery and the rest of Retail/Service/Lodging stay as the runbook says. Update the Thai runbook table row accordingly (done in `docs/ops/google-maps-cloud-style.md`).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach a calm light style and a matching dark style to the existing Map ID (`GOOGLE_MAPS_MAP_ID`), so our pins stand out from Google's POIs. Attractions and parks stay visible and tappable for TP-0077, and business POIs are faint or hidden.

**Architecture:** This is console-only ops work. The runbook [`docs/ops/google-maps-cloud-style.md`](../../ops/google-maps-cloud-style.md) (Thai, same style as `google-maps-setup.md`) holds every value and click path. The app already passes `mapId` and `colorScheme` to both Google maps (`real-map-canvas-google.tsx:92-93`, `pin-picker-map-google.tsx:28-29`), so **no code change** is needed.

**Tech Stack:** Google Cloud Console → Map management (Cloud-based maps styling, new feature taxonomy), Playwright for screenshots.

**Spec:** `docs/design-review/2026-10-28-ui-ux-review.md` §7.1, and §13's last bullet, which amends M11: keep `poi.attraction`/`poi.park`, hide business, and do not set `clickableIcons={false}`.

**Touches:** none (no source files). Docs: `docs/ops/google-maps-cloud-style.md` (new), `docs/ops/maps-cost-guardrails.md`, `AGENTS-INDEX.md`.

## Decision needed

| # | Question | Default (built on) |
|---|---|---|
| A | Food & drink POIs: faint or hidden? | **Faint** (grey pin, 60% label). They stay tappable for POI→add, and Google's orange no longer clashes with our food pins (M1). Switch to Off in the console if it is still cluttered. |
| B | Place of worship: §7.1 says hide the icon | **Show like attractions** (grey pin). Temples and shrines are the main sights on Japan/Thai trips; the test trip includes Tsurugaoka Hachimangu and the Kamakura Daibutsu. Hiding them would make them untappable. |
| C | Retail → Shopping: hidden (§7.1) or faint? *(added by scrutiny)* | **Hidden** (§7.1). Same trade-off as A: shopping streets and markets that Google files under Shopping (e.g. Komachi-dori, Kamakura) can't be tapped to add. Switch to faint like A if users ask. |

## Global Constraints

- The style goes on the **existing** Map ID. Do not create a new Map ID and do not change `GOOGLE_MAPS_MAP_ID` (the type cannot be edited; a new ID means an env change and a redeploy).
- Map type must be **JavaScript**. Vector/raster: keep whatever it is (setup §5 says Vector). Styling is checked under both (headless = raster).
- Visible and tappable: Entertainment (Arts, Historic, Museum, Theme park, Tourist attraction), Landmark, Recreation (Park, Nature reserve, Beach, Peak, Zoo, Hot spring, Trailhead), Transit station, Airport. Feature names checked against Google's current map-feature taxonomy (`developers.google.com/maps/documentation/cloud-customization/taxonomy`, 2026-10-29).
- Hidden: Retail, Service, Lodging, Casino, Cinema, sports Recreation, Road shield, Business corridor.
- Colors: §7.1 values `Land #f4f3ef`, `Water #cfe3ea`, rail stroke opacity 40%, label opacity 80%. Muted POI pin `#7b8794`. Dark values are in the runbook's §3 table.
- Never read `.env` values. Use the Map ID's console name `travel-planner-trip-map` or the prod network tab to identify it.
- Cost: none added. Still one Dynamic Maps load per map (cost guardrails row "Google Maps JavaScript API").

## Review Focus

1. **A styled-out POI becomes untappable.** Hiding a category silently disables TP-0077 for it. Check 5.2 (museum/shrine tap opens our card) and 5.3 (faint restaurant).
2. **Dark style never seen.** The app pins the theme to light, so the dark style is dormant. Check 5.9 sets the `theme=dark` cookie and reloads (the root layout honours it, `app/layout.tsx:55-58`), or flips `data-theme` live; if neither works, record "verify when dark mode ships".
3. **Raster fallback looks different.** Headless and no-WebGL clients get raster. Check 5.8 compares and records any gap instead of chasing it.
4. **Pin picker shares the Map ID.** The style also lands on the add-place picker. Check 5.7 confirms you can still click to drop a pin.
5. **Google logo/attribution hidden on mobile** after the style change. This is a ToS issue. Check 5.6.

---

### Task 1: Execute the runbook

**Files:**
- Use: `docs/ops/google-maps-cloud-style.md` §0–§4

- [ ] **Step 1:** §0: record the Map ID type, rendering, and current light/dark styles in the runbook's log table. Stop if the type is not JavaScript.
- [ ] **Step 2:** §1: take the before shots (`71-before-*.png`, 1440×900 + 390×844) with `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm dev -p 3210` on trip `79efe162-dfb2-46c2-ad46-a34695771b8b`.
- [ ] **Step 3:** §2–§3: create and publish `tp-trip-light` and `tp-trip-dark` with Decision A/B at their defaults.
- [ ] **Step 4:** §4: associate both styles with the Map ID.

### Task 2: Verify, then keep or roll back

- [ ] **Step 1:** Run checks 5.1–5.8 and 5.10 (5.9 optional) and take the `71-after-*.png` shots.
- [ ] **Step 2:** Expected: all pass. If 5.2 fails (attraction not tappable) or 5.6 fails (logo hidden), follow §6 rollback, fix the style, and re-associate it.
- [ ] **Step 3:** Fill in the runbook's log table and attach the before/after pairs to the ticket.

### Task 3: Docs

**Files:**
- Modify: `docs/ops/maps-cost-guardrails.md`: one line under the Maps JS row: "Map ID carries cloud styles `tp-trip-light`/`tp-trip-dark` (see google-maps-cloud-style.md); styling adds no cost."
- Modify: `docs/ops/google-maps-setup.md` §5: append "Style: see [google-maps-cloud-style.md](google-maps-cloud-style.md)".
- Modify: `AGENTS-INDEX.md` "Out-of-scope of this index": add `- Google Map ID cloud styles (light/dark), rollback → docs/ops/google-maps-cloud-style.md`.
- REQUIREMENTS.md: no change (no behavior/spec change).

- [ ] **Step 1:** Make the three edits.
- [ ] **Step 2:** Commit `docs(ops): cloud map style runbook + index [TP-0080]`.
