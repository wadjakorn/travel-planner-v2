type AuthFailureHost = object & { gm_authFailure?: () => void };

/**
 * Install a window.gm_authFailure handler that calls `cb` and any previous
 * handler. Returns a cleanup that restores the previous handler, unless
 * someone else replaced ours in the meantime.
 */
export function onGoogleAuthFailure(host: AuthFailureHost, cb: () => void): () => void {
  const prev = host.gm_authFailure;
  const handler = () => {
    cb();
    prev?.();
  };
  host.gm_authFailure = handler;
  return () => {
    if (host.gm_authFailure === handler) host.gm_authFailure = prev;
  };
}
