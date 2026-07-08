// Server-only feature flags. Read from env once at module load.
//
// Add new flags here so callers have a single place to look. Values are
// frozen at first import — changing env at runtime requires a server
// restart (Next dev/Turbopack picks it up via HMR on .env edits).

import 'server-only';

function readBool(name: string, defaultVal: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === '') return defaultVal;
  const lo = v.toLowerCase();
  return lo === 'true' || lo === '1' || lo === 'yes' || lo === 'on';
}

export const FEATURE_FLAGS = {
  // AUTH_BYPASS=true → skip Google OAuth; auto sign-in as a fixed dev user.
  // The dev user row is upserted into `user` table on first auth() call.
  // NEVER set true in production — it returns a valid session for any
  // request without credential check.
  // Default: OFF.
  authBypass: readBool('AUTH_BYPASS', false),
} as const;
