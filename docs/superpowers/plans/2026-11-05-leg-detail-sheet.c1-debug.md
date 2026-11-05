# C1 debug report — the list sometimes keeps the old leg after a sheet save (TP-0152)

Branch `feat/tp-0152-leg-sheet`, base HEAD `bdfa198`. Next 16.2.4, with the React that Next bundles
(`react-dom` 19.3.0-canary-3f0b9e61-20260317).

**Status: FIXED** — commit `f1214d7`.

## Root cause

React loses the wakeup for the router's transition. The save's `revalidatePath` makes the action
response carry the new tree, which streams in. While React renders it, a Flight chunk that has
already arrived calls React's ping **synchronously, inside the render**. By then the render is
"suspended with delay" (exit status 4), and React drops a ping that arrives during the render phase
(the TODO in React's `pingSuspendedRoot`). Right after that, `markRootSuspended` clears
`root.pingedLanes`. The transition lane stays suspended, and nothing is left to wake it. It retries
only when some other React update is scheduled, because any update clears `root.suspendedLanes`.
After a sheet save, nothing else updates: the sheet's own close was already committed before this.
So the list keeps the old tree until the user does something else, or reloads.

This is a race in React, not in our data or the router. It depends on when the chunks arrive, so it
fails about 1 run in 5 to 1 in 12. The old in-bar picker hid it in two ways. It drew its own pressed
state. And its `useTransition` `isPending → false` update came after the save, which is the kind of
"other update" that wakes the stuck lane.

## Evidence

Temporary instrumentation (all removed; `node_modules` restored from backups):
- `data-c1-rsc-at={Date.now()}` on the page `<aside>`. Render/commit probes in the page and in the
  trip layout.
- Logs around `saveLegAction`.
- Logs in Next's `ppr-navigations` (`createCacheNodeForSegment`) and `layout-router`.
- Logs in the bundled `react-dom-client.production.js`: `handleThrow`, `pingSuspendedRoot`,
  `markRootSuspended`, `commitRoot`.
- Network and history logs in the spec.

What the logs showed:

1. **The server sent the new data.** The failing action response was 200 with
   `x-action-revalidated: 1`. It held the new note (`hasNote=true`) and a new `rsc-at` stamp. The DOM
   kept the stamp of the original page load for the whole 15 s.
2. **It was not a router discard or a cache problem.** There was no `pushState`, `replaceState` or
   `popstate`, and no refresh GET, during the save. All four new cache nodes (root, `/trip`,
   `/trip/[id]`, `__PAGE__?day=1`) were seeded from the action response
   (`seed=true usedCached=false`). None of Next's deliberate suspends (`deferred-null`, `rsc-null`,
   no cache node) fired.
3. **React rendered the new tree once and never committed it.** The layout probe logged
   `render layout <new>`. `render page <new>` and both commits never appeared.
4. **The ping was lost.** These are the React logs from the failing run (owner-phone, TP-0152
   "edit a leg note"), after `action resolved`:

```
22.74s R ping lanes=512 wipLanes=0 status=fulfilled
22.74s render layout 1793875538819
22.74s R throw lanes=512 kind=suspense status=pending at … InnerLayoutRouter(page segment) …
22.74s R markRootSuspended lanes=512 exit=4        ← exit status is now "suspended with delay"
22.74s R ping lanes=512 wipLanes=512 status=fulfilled   ← ping fires inside the render: dropped
22.75s R markRootSuspended lanes=512 exit=4        ← clears root.pingedLanes
22.76s RES 200 POST … revalidated=1 hasNote=true
(nothing more on lane 512: no throw, ping, render or commit — 15 s)
```

   In passing runs, a ping can also arrive inside the render. But it arrives **before** the first
   `markRootSuspended` (exit status not yet 4). React then records it in
   `workInProgressRootPingedLanes` and does not drop it. Lane 512 goes on to suspend and ping a few
   more times, then logs `commit lanes=512`. The exact sequence
   `markRootSuspended(exit=4) → ping(wipLanes=512) → markRootSuspended` appeared only in the failure.

5. **Why the ping comes inside the render.** In the bundled React, `pingSuspendedRoot` does this
   when the exit status is 4: `0 === (executionContext & 2) && prepareFreshStack(root, 0)`. Inside
   the render, the RenderContext bit is set, so this does nothing, and the ping is not recorded
   either. Flight's `ReactPromise.prototype.then` calls `resolve` **synchronously** for a chunk that
   is already `resolved_model` or `fulfilled`. So when React's `attachPingListener` calls `.then`
   on a chunk whose data arrived after React last checked it, the ping runs inside the render.

## Fix

`app/src/lib/router-nudge.ts` adds `nudgeUntil(done, kick, { intervalMs = 250, maxMs = 10_000 })`.
It calls `kick` every interval until `done()` holds, or until it gives up.

`LegSheetProvider` (`leg-sheet-context.tsx`) has a new `saved` callback that `LegSheet` calls in
place of `onClose` after a successful save (new optional prop `onSaved`). It:
- remembers the layout payload it renders (its `children`);
- closes the sheet;
- every 250 ms, bumps a counter state in the provider. This is a cheap re-render: the children keep
  the same identity, so React bails out below it. It stops as soon as `children` is a new object,
  which means the router committed a tree rendered after the save. It also stops after 10 s, or
  when the provider unmounts.

Each bump is an ordinary React update. That clears `root.suspendedLanes`, so a stuck transition is
retried at most about 250 ms after its data has arrived. When nothing is stuck, the new tree commits
on its own and the loop stops after a few cheap bumps.

The data flow and the server action are unchanged. There is no extra network request (unlike
`router.refresh()`, which would also stream a transition and could get stuck the same way). There is
no optimistic copy of the bar, which would only hide a stale tree under it.

Regression guards:
- Unit: `src/lib/router-nudge.test.ts` (4 tests, fake timers): it bumps until done, never bumps
  when already done, gives up after `maxMs`, and stops when cancelled.
- E2E: the three C1 tests, `--repeat-each=10` on both projects (below).

## Results

Fix commit: `f1214d7` (on `bdfa198`).

**Before the fix** (same grep, instrumented builds): the bar check failed in about 1 of 12 runs on
owner-phone across runs 1–5. Runs 1 and 3 also had unrelated setup failures (token-create timeouts,
API timeouts). Task 8 saw about 15–25%.

**After the fix** (clean build, `MAPS_PROVIDER=google AUTH_BYPASS=true pnpm start -p 3211`):

| Run | Result |
|---|---|
| `--project=owner-phone --project=desktop --grep "TP-0152: edit a leg note\|hotel-to-first-stop\|a segment mode change" --repeat-each=10` | **98 passed · 2 failed · 20 skipped** (52.5 min; skipped = "fresh data" is phone-only) |
| Re-run of the 2 failed tests (desktop, en), `--repeat-each=10` | **20 passed · 0 failed** (10.2 min) |

- **No bar or list check failed.** In 100 runs, the "bar shows the new value" assertion passed every
  time it ran.
- **Both failures were the harness's own API read.** `readTrip` in
  `TP-0141 hotel-to-first-stop (desktop en, repeat 4)` and `TP-0152 edit note (desktop en,
  repeat 5)` threw `apiRequestContext.get: read ECONNRESET` (seen in the trace).
  - In the edit-note run, the bar assertion had already passed (line 2151); the throw came from
    `savedLegs` on the next line.
  - In the hotel run, the throw came from the "day 2 start saved" API poll, before the bar check.
- **Other checks:** `pnpm vitest run` 121 files passed / 19 skipped (1540 tests passed, 117
  skipped). `pnpm typecheck` clean. `pnpm lint` has 0 errors; its 2 warnings were already there
  (`src/lib/places/text-search.test.ts`).

## Notes / concerns

- The real bug is in React. Upstream marks this case as a TODO (a render-phase ping during "suspended
  with delay" is not handled). Every streamed transition in the app can hit it. It usually goes
  unseen because some later update wakes the lane: a hover, an `isPending` flip, or a scroll-driven
  state change. Other "await action, then close a modal" flows could show the same stale list now
  and then. One example is `place-note-modal.tsx`. It renders inside the page, so its unmount
  happens at a different time, but the risk is the same. If it shows up there, `nudgeUntil` can be
  reused.
- When we upgrade Next/React, check whether `pingSuspendedRoot` handles render-phase pings. If it
  does, the nudge can go.
- The e2e harness's `readTrip` sometimes fails with `ECONNRESET` (the Playwright API context reuses
  a keep-alive socket that the server has closed). That is what caused the 2 failures above. It is
  not related to C1, and a retry in `readTrip` would remove it.
