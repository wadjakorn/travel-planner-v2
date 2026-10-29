// Why the page session fell back from Google Maps to MapLibre. The values are
// the telemetry `map_degraded.reason` allowlist; telemetry hooks onDegrade.
export type DegradeReason = 'load_error' | 'auth' | 'render_error';

export function degradedLogLine(reason: DegradeReason): string {
  return `[maps] Google Maps unavailable (${reason}); using the backup map`;
}

/**
 * Build `markDegraded`: the first call logs one line (with its reason and
 * optional detail) and fires `onDegrade(reason)`; later calls are no-ops, so
 * gm_authFailure followed by the boundary catching the dead map's marker
 * throw gives one log line and one state flip. With `enabled: false` (open
 * mode: there is no Google to lose) every call is a no-op.
 */
export function degradeOnce(
  log: (line: string, detail?: unknown) => void,
  onDegrade: (reason: DegradeReason) => void,
  o: { enabled?: boolean } = {},
): (reason: DegradeReason, detail?: unknown) => void {
  let done = o.enabled === false;
  return (reason, detail) => {
    if (done) return;
    done = true;
    if (detail === undefined) log(degradedLogLine(reason));
    else log(degradedLogLine(reason), detail);
    onDegrade(reason);
  };
}
