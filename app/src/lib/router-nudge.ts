// Calls `kick` every `intervalMs` until `done()` holds or `maxMs` passes.
//
// Why (TP-0152 C1): a server action that calls revalidatePath hands the new
// tree to the router as a streamed transition. React can lose the wakeup for
// that transition: a Flight chunk that has already arrived calls its ping
// synchronously inside the render, and once the render is "suspended with
// delay" React drops a render-phase ping (see the TODO in React's
// pingSuspendedRoot), then markRootSuspended clears it. The lane stays
// suspended, with nothing left to wake it, so the list keeps the old tree until
// some other React update arrives (any update clears root.suspendedLanes).
// When the caller of the action closes and nothing else updates, nothing
// arrives. The kick is that update: a cheap state change that makes React retry
// the stranded transition.
//
// Workaround, tracked in TP-0154: remove when React handles render-phase pings
// in pingSuspendedRoot.

export function nudgeUntil(
  done: () => boolean,
  kick: () => void,
  { intervalMs = 250, maxMs = 10_000 }: { intervalMs?: number; maxMs?: number } = {},
): () => void {
  let elapsed = 0;
  const id = setInterval(() => {
    elapsed += intervalMs;
    if (done()) {
      clearInterval(id);
      return;
    }
    kick();
    if (elapsed >= maxMs) {
      clearInterval(id);
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[router-nudge] gave up after', maxMs, 'ms; transition still not rendered');
      }
    }
  }, intervalMs);
  return () => clearInterval(id);
}
